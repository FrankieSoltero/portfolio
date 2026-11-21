import { describe, expect, it } from 'vitest';
import { isShopPhotoUrl, shopForHost } from './shops';

describe('shopForHost', () => {
  it.each(['ikea.com', 'www.ikea.com', 'WWW.IKEA.COM', 'www.ikea.com.'])('reads %s as ikea', (host) => {
    expect(shopForHost(host)).toBe('ikea');
  });

  it.each(['amazon.com', 'www.amazon.com', 'smile.amazon.com', 'a.co'])('reads %s as amazon', (host) => {
    expect(shopForHost(host)).toBe('amazon');
  });

  it('reads www.wayfair.com as wayfair', () => {
    expect(shopForHost('www.wayfair.com')).toBe('wayfair');
  });

  it.each([
    'ikea.com.evil.example', 'evilikea.com', 'ikea.co', 'amazon.co.uk', 'xa.co', 'wayfair.com.au', '', 'localhost',
    '127.0.0.1', '[::1]',
  ])('refuses the look-alike or non-shop host %j', (host) => {
    expect(shopForHost(host)).toBeNull();
  });

  it.each([
    'evil.example#.ikea.com',
    'x@evil.com?.amazon.com',
    'a b.ikea.com',
    'evil.example/.wayfair.com',
    'evil.example\\.ikea.com',
    '.ikea.com',
    'a..ikea.com',
    'evil.example\t.ikea.com',
    'evil.example\r\n.amazon.com',
    'evil.example\n.ikea.com',
    'evil.example:443.ikea.com',
    'evil%2eexample.ikea.com',
  ])('refuses the malformed host string %j even though it ends in a shop domain', (host) => {
    expect(shopForHost(host)).toBeNull();
  });

  it('refuses a host longer than 253 characters that ends in a shop domain', () => {
    const labels = `${Array.from({ length: 50 }, () => 'abcde').join('.')}.ikea.com`;
    const tooLong = labels.slice(-300);
    expect(tooLong).toHaveLength(300);
    expect(shopForHost(tooLong)).toBeNull();
    // The same shape at exactly 253 characters is a plain hostname and is accepted.
    const atLimit = labels.slice(-253);
    expect(atLimit).toMatch(/^[a-z]/);
    expect(atLimit).toHaveLength(253);
    expect(shopForHost(atLimit)).toBe('ikea');
  });

  it('accepts a punycode subdomain of a shop domain', () => {
    expect(shopForHost('xn--bcher-kva.ikea.com')).toBe('ikea');
  });

  it.each([[42], [null], [undefined], [{}], [['ikea.com']]])('returns null, without throwing, for the non-string %j', (value) => {
    expect(shopForHost(value as unknown as string)).toBeNull();
  });
});

describe('isShopPhotoUrl', () => {
  const accepted = [
    'https://www.ikea.com/us/en/images/products/x.jpg',
    'https://m.media-amazon.com/images/I/a.jpg',
    'https://assets.wfcdn.com/im/1/x.jpg',
  ];

  it.each(accepted)('accepts %s', (url) => {
    expect(isShopPhotoUrl(url)).toBe(true);
  });

  it.each(accepted.map((url) => url.replace('https://', 'http://')))('refuses the http form %s', (url) => {
    expect(isShopPhotoUrl(url)).toBe(false);
  });

  it.each([
    'https://media-amazon.com/a.jpg',
    'https://assets.wfcdn.com.evil.example/a.jpg',
    'https://user:pass@m.media-amazon.com/images/I/a.jpg',
    'https://user@m.media-amazon.com/images/I/a.jpg',
    'https://m.media-amazon.com:8443/images/I/a.jpg',
    'https://m.media-amazon.com:443/images/I/a.jpg',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isShopPhotoUrl(url)).toBe(false);
  });

  // The URL parser keeps a trailing dot, lower-cases the scheme and host, and silently removes
  // tabs and newlines; each of these still names a shop photo host, so accepting it is safe.
  it.each([
    'https://www.ikea.com./us/en/images/products/x.jpg',
    'HTTPS://WWW.IKEA.COM/us/en/images/products/x.jpg',
    'https://www.ikea.com/us/en/images/products/x\t.jpg',
    'https://m.media-amazon\n.com/images/I/a.jpg',
  ])('accepts %j, which still names a photo host', (url) => {
    expect(isShopPhotoUrl(url)).toBe(true);
  });

  it.each([
    'https:\\\\www.ikea.com\\x.jpg',
    'https://evil.example\t:443/.ikea.com/x.jpg',
    'https://evil.example\n/x.jpg#.ikea.com',
    'ht\ttps://evil.example/x.jpg',
  ])('refuses %j', (url) => {
    expect(isShopPhotoUrl(url)).toBe(false);
  });

  it('refuses a photo URL longer than 2048 characters', () => {
    const base = 'https://assets.wfcdn.com/im/1/';
    const long = `${base}${'a'.repeat(2049 - base.length - 4)}.jpg`;
    expect(long).toHaveLength(2049);
    expect(isShopPhotoUrl(long)).toBe(false);
    // The same URL at exactly the limit is accepted, so only the length refused it.
    expect(isShopPhotoUrl(long.slice(0, 2044) + '.jpg')).toBe(true);
  });
});
