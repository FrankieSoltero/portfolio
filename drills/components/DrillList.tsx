// drills/components/DrillList.tsx
// Content of the /drills index: heading, intro and one entry per drill in `order`.
// No hooks and no client state: it renders on the server. Progress UI (streak, done
// count, badges, today's drill) is out of scope until the runner exists.
// Class names are prefixed `drills-` so drills.css can style them.

import Link from "next/link";
import type { DrillMeta } from "@/lib/drills";

/** Intro sentence, also the index page's meta description. */
export const DRILLS_INTRO =
  "Each drill is a pull request that runs but isn't ready to merge. Read the brief, find what's wrong, fix it.";

const MAX_DIFFICULTY = 3;

export function DrillList({ drills }: { drills: DrillMeta[] }): React.JSX.Element {
  const ordered = [...drills].sort((a, b) => a.order - b.order);

  return (
    <>
      <header className="drills-index-header">
        <h1>REACT REVIEW DRILLS</h1>
        <p className="drills-intro">{DRILLS_INTRO}</p>
      </header>
      {ordered.length === 0 ? (
        <p className="drills-empty">No drills yet.</p>
      ) : (
        <ol className="drills-list">
          {ordered.map((d) => (
            <li key={d.slug} className="drills-entry">
              <span className="drills-entry-number">{String(d.order).padStart(2, "0")}</span>
              <h2 className="drills-entry-title">
                <Link href={`/drills/${d.slug}`}>{d.title}</Link>
              </h2>
              <p className="drills-entry-summary">{d.summary}</p>
              <p className="drills-entry-meta">
                <span className="drills-entry-skills">
                  {d.skills.map((s) => s.toUpperCase()).join(" · ")}
                </span>{" "}
                <span className="drills-entry-minutes">{d.minutes} MIN</span>{" "}
                <Difficulty level={d.difficulty} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Difficulty({ level }: { level: DrillMeta["difficulty"] }): React.JSX.Element {
  return (
    <span
      className="drills-difficulty"
      role="img"
      aria-label={`Difficulty ${level} of ${MAX_DIFFICULTY}`}
    >
      {Array.from({ length: MAX_DIFFICULTY }, (_, i) =>
        i < level ? (
          <span key={i} className="drills-pip drills-pip-filled">
            ■
          </span>
        ) : (
          <span key={i} className="drills-pip drills-pip-empty">
            □
          </span>
        ),
      )}
    </span>
  );
}
