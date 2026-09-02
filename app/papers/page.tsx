// app/papers/page.tsx
// Index page: log of all paper reproductions, newest first, filterable by tag.

import { getAllPapers, getAllTags } from "@/lib/papers";
import { PaperIndexEntry } from "@/components/papers/PaperIndexEntry";
import { TagFilter } from "@/components/papers/TagFilter";

export const metadata = {
  title: "Papers",
  description:
    "AI research papers, broken down in plain English and reproduced at small scale.",
};

export default async function PapersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const tags = getAllTags();
  const active = tag && tags.includes(tag) ? tag : undefined;
  const papers = getAllPapers().filter(
    (p) => !active || p.meta.tags.includes(active)
  );

  return (
    <main>
      <h1>Papers</h1>
      <p className="papers-index-intro">
        Research papers broken down in my own words, with each core experiment
        reproduced at a scale that fits on one GPU. Every entry links its repo.
      </p>
      <TagFilter tags={tags} active={active} />
      <ul className="papers-index-list">
        {papers.map((p) => (
          <li key={p.meta.slug}>
            <PaperIndexEntry meta={p.meta} />
          </li>
        ))}
      </ul>
      {papers.length === 0 && (
        <p className="meta-line">No entries yet{active ? ` for "${active}"` : ""}.</p>
      )}
    </main>
  );
}
