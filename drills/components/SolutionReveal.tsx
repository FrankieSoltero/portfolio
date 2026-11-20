"use client";
// drills/components/SolutionReveal.tsx
// Holds a drill's fix (already-rendered solution code and explanation, passed in as
// children from the server page) behind a `REVEAL THE FIX` button. The children are in
// the page from the start but `hidden` until the click, which also records the reveal
// in the progress store and removes the button.

import { useState } from "react";
import { useProgress } from "@/drills/useProgress";

export function SolutionReveal({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { reveal } = useProgress();
  const [revealed, setRevealed] = useState(false);

  function handleReveal(): void {
    if (revealed) return;
    setRevealed(true);
    reveal(slug);
  }

  return (
    <div className="drills-solution">
      {!revealed && (
        <button type="button" className="drills-button drills-reveal-button" onClick={handleReveal}>
          REVEAL THE FIX
        </button>
      )}
      <div className="drills-solution-body" hidden={!revealed}>
        {children}
      </div>
    </div>
  );
}
