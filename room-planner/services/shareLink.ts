import { CONFIG } from '../config';
import { parsePlan } from '../domain/planSchema';
import type { PlanDocument } from '../domain/types';

/**
 * Share-link data: a plan packed into text for the address fragment, and read back.
 *
 * The data is `<version>.<payload>`. Version 1: the payload is base64url (no padding) of the
 * raw-deflate of the plan's UTF-8 JSON. Version 0: base64url of the UTF-8 JSON, uncompressed, used
 * when the browser cannot compress. A version of 2 or more comes from a newer planner.
 *
 * Data read back comes from the address bar and is untrusted: text longer than `MAX_DATA_CHARS` is
 * refused before anything is decoded, inflating stops as soon as the output passes `MAX_BYTES`, and
 * a plan reaches the caller only as the `doc` of a `parsePlan` success. Nothing is logged, and
 * neither function throws or rejects.
 */

export type ShareDecodeResult =
  | { status: 'ok'; doc: PlanDocument }
  | { status: 'invalid' }
  | { status: 'newer' };

/** The most UTF-8 JSON bytes encoded or decoded (the same limit as a plan saved in the browser). */
const MAX_BYTES = CONFIG.maxStoredChars;
/** The longest data accepted: a 1-digit version, the dot, and base64url of MAX_BYTES bytes. */
const MAX_DATA_CHARS = 2 + Math.ceil((MAX_BYTES * 4) / 3);
const FORMAT: CompressionFormat = 'deflate-raw';
const VERSION_PATTERN = /^[0-9]{1,3}$/;
const PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Each alphabet character's 6-bit value, keyed by the character. */
const SEXTETS: Readonly<Record<string, number>> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** base64url of the bytes, without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const rest = bytes.length - i;
    const n = (bytes[i] << 16) | ((rest > 1 ? bytes[i + 1] : 0) << 8) | (rest > 2 ? bytes[i + 2] : 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (rest > 1) out += ALPHABET[(n >> 6) & 63];
    if (rest > 2) out += ALPHABET[n & 63];
  }
  return out;
}

/**
 * The bytes of an unpadded base64url payload. The caller has already checked that every character
 * is in the alphabet and that the length is not 1 more than a multiple of 4.
 */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let buffered = 0;
  let at = 0;
  for (const c of text) {
    bits = ((bits << 6) | SEXTETS[c]) & 0xffffff;
    buffered += 6;
    if (buffered >= 8) {
      buffered -= 8;
      bytes[at++] = (bits >> buffered) & 0xff;
    }
  }
  return bytes;
}

/**
 * Feeds the input through a compression or decompression stream and collects its output, or null as
 * soon as the output passes `limit` bytes (reading stops there). Rejects when the stream errors.
 */
async function pump(
  stream: { readonly writable: WritableStream<BufferSource>; readonly readable: ReadableStream<Uint8Array> },
  input: Uint8Array<ArrayBuffer>,
  limit: number,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  // A stream error surfaces through the reader below; these are observed so they never go unhandled.
  writer.write(input).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > limit) {
      reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(next.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/**
 * The raw-deflate of the bytes, or null when compression is missing or fails, or when its output
 * passes MAX_BYTES (so the version 1 data could exceed MAX_DATA_CHARS); the caller then sends
 * version 0, which always fits.
 */
async function compress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return await pump(new CompressionStream(FORMAT), bytes, MAX_BYTES);
  } catch {
    return null;
  }
}

/** The inflated bytes, or null when decompression is missing or the output passes MAX_BYTES. Rejects on a broken stream. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  return pump(new DecompressionStream(FORMAT), bytes, MAX_BYTES);
}

/** The share data for a plan, or null when the plan cannot be shared. Never rejects. */
export async function encodePlan(doc: PlanDocument): Promise<string | null> {
  try {
    // Built field by field: the argument may be a store state carrying actions and UI state.
    const fields: PlanDocument = {
      schemaVersion: doc.schemaVersion,
      units: doc.units,
      room: doc.room,
      items: doc.items,
      openings: doc.openings,
      obstacles: doc.obstacles,
    };
    // Never share a plan the receiving planner would refuse.
    if (!parsePlan(fields).ok) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(fields));
    if (bytes.length > MAX_BYTES) return null;
    const packed = await compress(bytes);
    return packed === null ? `0.${toBase64Url(bytes)}` : `1.${toBase64Url(packed)}`;
  } catch {
    return null;
  }
}

/** Reads share data. Never throws, never rejects. */
export async function decodePlan(data: string): Promise<ShareDecodeResult> {
  try {
    if (typeof data !== 'string' || data.length > MAX_DATA_CHARS) return { status: 'invalid' };
    const dot = data.indexOf('.');
    if (dot < 0) return { status: 'invalid' };
    const versionText = data.slice(0, dot);
    if (!VERSION_PATTERN.test(versionText)) return { status: 'invalid' };
    const version = Number(versionText);
    if (version >= 2) return { status: 'newer' };
    const payload = data.slice(dot + 1);
    if (!PAYLOAD_PATTERN.test(payload) || payload.length % 4 === 1) return { status: 'invalid' };
    const packed = fromBase64Url(payload);
    const bytes = version === 1 ? await inflate(packed) : packed;
    if (bytes === null || bytes.length > MAX_BYTES) return { status: 'invalid' };
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const result = parsePlan(JSON.parse(text));
    if (result.ok) return { status: 'ok', doc: result.doc };
    return result.newer ? { status: 'newer' } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}
