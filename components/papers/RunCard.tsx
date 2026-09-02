// components/papers/RunCard.tsx
// The signature element: an experiment run sheet rendered from frontmatter.
// Set entirely in IBM Plex Mono. Bordered card, quiet, information-dense.

import type { ReproMeta, ReproResult } from "@/lib/papers";

export function RunBadge({ result }: { result: ReproResult }) {
  return (
    <span className="run-badge" data-result={result}>
      {result.toUpperCase()}
    </span>
  );
}

export function RunCard({ repro }: { repro: ReproMeta }) {
  const rows: Array<[string, string]> = [
    ["model", repro.model],
    ["dataset", repro.dataset],
    ["hardware", repro.hardware],
    ["claim", repro.claim],
    ["delta", repro.delta],
  ];

  return (
    <section className="run-card" aria-label="Reproduction run sheet">
      <div className="run-card-head">
        <span>RUN CARD</span>
        <RunBadge result={repro.result} />
      </div>
      <dl className="run-card-body">
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
