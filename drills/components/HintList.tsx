"use client";
// drills/components/HintList.tsx
// A drill's hints, revealed one at a time: none at first, then one more per click of
// `REVEAL HINT <n> OF <total>`. The button disappears once every hint is shown.
// Reveal state lives only for the visit; nothing is stored.

import { useState } from "react";

export function HintList({ hints }: { hints: string[] }): React.JSX.Element {
  const [shown, setShown] = useState(0);
  const total = hints.length;

  return (
    <div className="drills-hints">
      {shown > 0 && (
        <ol className="drills-hint-list">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={i} className="drills-hint">
              {hint}
            </li>
          ))}
        </ol>
      )}
      {shown < total && (
        <button
          type="button"
          className="drills-button drills-hint-button"
          onClick={() => setShown((n) => Math.min(n + 1, total))}
        >
          {`REVEAL HINT ${shown + 1} OF ${total}`}
        </button>
      )}
    </div>
  );
}
