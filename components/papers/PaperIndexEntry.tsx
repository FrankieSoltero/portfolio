// components/papers/PaperIndexEntry.tsx
// One row of the experiment log: title, date, tags, summary, mini result badge.

import Link from "next/link";
import type { PaperMeta } from "@/lib/papers";
import { RunBadge } from "./RunCard";

export function PaperIndexEntry({ meta }: { meta: PaperMeta }) {
  return (
    <article className="paper-entry">
      <div className="paper-entry-head">
        <h2 className="paper-entry-title">
          <Link href={`/papers/${meta.slug}`}>{meta.title}</Link>
        </h2>
        <RunBadge result={meta.repro.result} />
      </div>
      <p className="paper-entry-summary">{meta.summary}</p>
      <p className="meta-line">
        {meta.date} · {meta.authors} · {meta.readingTime} · {meta.tags.join(", ")}
      </p>
    </article>
  );
}
