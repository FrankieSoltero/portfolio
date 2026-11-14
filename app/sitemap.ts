// app/sitemap.ts
// Sitemap: the 8-bit homepage, the papers section and the room planner.

import type { MetadataRoute } from "next";
import { getAllPapers } from "@/lib/papers";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const papers = getAllPapers().map((p) => ({
    url: `${siteUrl}/papers/${p.meta.slug}`,
    lastModified: new Date(`${p.meta.date}T00:00:00Z`),
  }));

  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/papers` },
    { url: `${siteUrl}/room-planner` },
    ...papers,
  ];
}
