// app/papers/feed.xml/route.ts
// RSS 2.0 feed of published papers.

import { Feed } from "feed";
import { getAllPapers } from "@/lib/papers";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const papers = getAllPapers();

  const feed = new Feed({
    title: "Papers · Francisco Soltero",
    description:
      "AI research papers, broken down in plain English and reproduced at small scale.",
    id: `${siteUrl}/papers`,
    link: `${siteUrl}/papers`,
    language: "en",
    copyright: `© ${papers.length ? papers[0].meta.date.slice(0, 4) : ""} Francisco Soltero`,
    feedLinks: { rss: `${siteUrl}/papers/feed.xml` },
    author: { name: "Francisco Soltero", email: "frankiesoltero@gmail.com" },
  });

  for (const p of papers) {
    feed.addItem({
      title: p.meta.title,
      id: `${siteUrl}/papers/${p.meta.slug}`,
      link: `${siteUrl}/papers/${p.meta.slug}`,
      description: p.meta.summary,
      date: new Date(`${p.meta.date}T00:00:00Z`),
      category: p.meta.tags.map((t) => ({ name: t })),
    });
  }

  return new Response(feed.rss2(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
