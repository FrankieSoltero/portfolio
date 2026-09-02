// lib/site.ts
// Canonical site URL for absolute links (RSS, sitemap, OpenGraph).
// Override with NEXT_PUBLIC_SITE_URL once a custom domain exists.

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
