import { describe, expect, it } from 'vitest';
import { PRODUCT_TEXT_LIMITS, parsePlan } from '../domain/planSchema';
import { createInitialDocument } from '../domain/catalog';
import { LOOKUP_MESSAGES, LookupError, UNTITLED_PRODUCT, capProductText, parseProductUrl } from './productLookup';

function expectInvalid(raw: string): void {
  let caught: unknown;
  try {
    parseProductUrl(raw);
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected ${JSON.stringify(raw)} to be rejected`).toBeInstanceOf(LookupError);
  expect((caught as LookupError).code).toBe('invalid_url');
}

describe('LOOKUP_MESSAGES', () => {
  it('has the exact user-facing copy', () => {
    expect(LOOKUP_MESSAGES.invalid_url).toBe("That doesn't look like a link. Paste the full product URL.");
    expect(LOOKUP_MESSAGES.unavailable).toBe(
      "Couldn't read that page. Try again, or enter the product by hand later.",
    );
  });
});

describe('LookupError', () => {
  it('carries its code and the matching message', () => {
    const err = new LookupError('unavailable');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('unavailable');
    expect(err.message).toBe(LOOKUP_MESSAGES.unavailable);
    expect(err.name).toBe('LookupError');
  });
});

describe('parseProductUrl', () => {
  it('parses a full URL, dropping a leading www.', () => {
    const parsed = parseProductUrl('https://www.shop.example/a/b');
    expect(parsed.host).toBe('shop.example');
    expect(parsed.path).toBe('/a/b');
    expect(parsed.url).toBe('https://www.shop.example/a/b');
  });

  it('accepts a link without a scheme and normalises it to https', () => {
    const parsed = parseProductUrl('shop.example/x');
    expect(parsed.url.startsWith('https://')).toBe(true);
    expect(parsed.url).toBe('https://shop.example/x');
    expect(parsed.host).toBe('shop.example');
    expect(parsed.path).toBe('/x');
  });

  it('accepts a plain http link', () => {
    const parsed = parseProductUrl('http://shop.example/x');
    expect(parsed.url).toBe('http://shop.example/x');
  });

  it('accepts a scheme-less host with a port', () => {
    const parsed = parseProductUrl('shop.example:8080/x');
    expect(parsed.url).toBe('https://shop.example:8080/x');
    expect(parsed.host).toBe('shop.example');
  });

  it('trims leading and trailing whitespace', () => {
    const parsed = parseProductUrl('   https://shop.example/a  \n');
    expect(parsed.url).toBe('https://shop.example/a');
    expect(parsed.host).toBe('shop.example');
  });

  it('strips credentials from the URL but keeps the query string', () => {
    const parsed = parseProductUrl('https://u:p@shop.example/x');
    expect(parsed.url).toBe('https://shop.example/x');
    expect(parsed.host).toBe('shop.example');
    expect(parsed.url).not.toContain('@');
    expect(parseProductUrl('https://u:p@shop.example/x?token=1').url).toBe(
      'https://shop.example/x?token=1',
    );
  });

  it.each(['localhost', 'sofa'])('rejects a host with no dot: %s', (raw) => {
    expectInvalid(raw);
  });

  it.each(['', '   '])('rejects empty input: %j', (raw) => {
    expectInvalid(raw);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(document.cookie)//shop.example',
    'ftp://a.b/c',
    'data:text/html,x',
    'mailto:someone@shop.example',
    'file:///etc/passwd.txt',
  ])('rejects a non-http(s) scheme rather than prepending https: %s', (raw) => {
    expectInvalid(raw);
  });

  // Most of these pass the scheme-less host:port allowance and are caught only by the no-dot host check.
  it.each([
    'javascript://host.tld/%0aalert(1)',
    'javascript:/a.b',
    'http:/\\evil.com',
    'vbscript:a.b',
    'file:///etc/passwd',
  ])('rejects a scheme-like input that resembles host:port: %s', (raw) => {
    expectInvalid(raw);
  });
});

describe('capProductText', () => {
  const LONG_URL = `https://shop.example/${'a'.repeat(3000)}`;

  it('uses the saved-plan limits: link 2048, name 200, host 255, model label 200 characters', () => {
    expect(PRODUCT_TEXT_LIMITS).toEqual({ urlMax: 2048, nameMax: 200, hostMax: 255, labelMax: 200 });
  });

  it('keeps text within the limits unchanged', () => {
    const text = { name: 'Alder 3-seat sofa', host: 'shop.example', sourceUrl: 'https://shop.example/living/sofa' };
    expect(capProductText(text)).toEqual(text);
    expect(capProductText({ ...text, sourceUrl: null }).sourceUrl).toBeNull();
  });

  it('stores a link longer than 2048 characters as null and keeps one of exactly 2048', () => {
    const exact = LONG_URL.slice(0, 2048);
    expect(capProductText({ name: 'n', host: 'h', sourceUrl: exact }).sourceUrl).toBe(exact);
    expect(capProductText({ name: 'n', host: 'h', sourceUrl: LONG_URL.slice(0, 2049) }).sourceUrl).toBeNull();
    expect(capProductText({ name: 'n', host: 'h', sourceUrl: LONG_URL }).sourceUrl).toBeNull();
  });

  it('cuts the name to 200 characters and the host to 255', () => {
    const capped = capProductText({ name: 'n'.repeat(500), host: 'h'.repeat(300), sourceUrl: null });
    expect(capped.name).toBe('n'.repeat(200));
    expect(capped.host).toBe('h'.repeat(255));
  });

  it('never leaves the name empty: an empty name becomes the default name', () => {
    expect(UNTITLED_PRODUCT).toBe('Untitled product');
    expect(capProductText({ name: '', host: 'h', sourceUrl: null }).name).toBe('Untitled product');
  });

  it('gives fields a saved plan accepts', () => {
    const doc = createInitialDocument();
    const capped = capProductText({ name: 'n'.repeat(500), host: 'h'.repeat(300), sourceUrl: LONG_URL });
    doc.items[0] = { ...doc.items[0], ...capped };
    expect(parsePlan(JSON.parse(JSON.stringify(doc))).ok).toBe(true);
  });
});
