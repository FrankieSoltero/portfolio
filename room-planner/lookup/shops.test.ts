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

  it('refuses a photo URL longer than 2048 characters', () => {
    const base = 'https://assets.wfcdn.com/im/1/';
    const long = `${base}${'a'.repeat(2049 - base.length - 4)}.jpg`;
    expect(long).toHaveLength(2049);
    expect(isShopPhotoUrl(long)).toBe(false);
    // The same URL at exactly the limit is accepted, so only the length refused it.
    expect(isShopPhotoUrl(long.slice(0, 2044) + '.jpg')).toBe(true);
  });
});
