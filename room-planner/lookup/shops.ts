/**
 * The shops a pasted link may come from and the hosts their product photos may be loaded from.
 * Shared by the lookup route and the browser, so it imports nothing from `node:` or `server/`.
 * Both checks are exact: a host matches a domain only when it is that domain or one of its
 * subdomains, so look-alikes such as `ikea.com.evil.example` or `evilikea.com` never match.
 */

/** A shop the planner can read a product page from. */
export type Shop = 'ikea' | 'amazon' | 'wayfair';

/** Each shop's own domains; each also matches its subdomains. */
const SHOP_DOMAINS: readonly (readonly [string, Shop])[] = [
  ['ikea.com', 'ikea'],
  ['amazon.com', 'amazon'],
  ['a.co', 'amazon'],
  ['wayfair.com', 'wayfair'],
];

/** The hosts a product photo may be loaded from; each also matches its subdomains. */
const PHOTO_DOMAINS: readonly string[] = ['ikea.com', 'm.media-amazon.com', 'assets.wfcdn.com'];

/** The longest photo address accepted, the same as the longest link. */
const PHOTO_URL_MAX = 2048;

/** The authority of an `https://` address: everything up to the first `/`, `\`, `?` or `#`. */
const HTTPS_AUTHORITY = /^https:\/\/([^/\\?#]*)/i;

/** True when `host` is `domain` or one of its subdomains. `host` must already be lower case. */
function isOnDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** The hostname in lower case with one trailing dot (the fully qualified form) removed. */
function normaliseHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

/** The longest hostname, in characters, without its trailing dot. */
const HOST_MAX = 253;

/**
 * A plain lower-case hostname: labels of `a-z`, `0-9` and `-` joined by single dots, none empty.
 * It refuses anything that is not a hostname but could end in a shop domain, such as a string
 * holding `:`, `@`, `/`, `\`, `#`, `?`, `%`, whitespace or brackets. Punycode labels fit.
 */
const PLAIN_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/**
 * The shop a hostname belongs to (`ikea.com`, `amazon.com`, `a.co`, `wayfair.com` or a subdomain
 * of one, in any case, with or without a trailing dot), or null for any other host and for any
 * string that is not a plain hostname of at most 253 characters. Never throws.
 */
export function shopForHost(hostname: string): Shop | null {
  if (typeof hostname !== 'string') return null;
  const host = normaliseHost(hostname);
  if (host.length > HOST_MAX || !PLAIN_HOST.test(host)) return null;
  for (const [domain, shop] of SHOP_DOMAINS) {
    if (isOnDomain(host, domain)) return shop;
  }
  return null;
}

/**
 * True when `url` is a product photo the planner may show: an `https` address of at most 2048
 * characters on a photo host (`ikea.com`, `m.media-amazon.com`, `assets.wfcdn.com` or a
 * subdomain), with no user name, password or port (not even an explicit `:443`). Never throws.
 */
export function isShopPhotoUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > PHOTO_URL_MAX) return false;
  // The scheme and port are read from the text itself, because the URL parser drops a default
  // port such as `:443`. A `:` anywhere in the authority is a port or a password, both refused.
  const authority = HTTPS_AUTHORITY.exec(url)?.[1];
  if (authority === undefined || authority.includes(':')) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username !== '' || parsed.password !== '') return false;
  const host = normaliseHost(parsed.hostname);
  return PHOTO_DOMAINS.some((domain) => isOnDomain(host, domain));
}
