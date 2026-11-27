"use client";
// drills/components/ProgressBadges.tsx
// The /drills index badges: the daily streak and how many of the listed drills are done,
// read from the shared progress store. Until stored progress is read (the server render
// and the first client render) the paragraph is rendered empty so both renders match.

import { completedCount, localDate, streak } from "@/drills/progress";
import { useProgress } from "@/drills/useProgress";

export function ProgressBadges({ slugs }: { slugs: string[] }): React.JSX.Element {
  const { progress, ready } = useProgress();

  if (!ready) return <p className="drills-badges" />;

  const days = streak(progress, localDate(new Date()));
  const done = completedCount(slugs, progress);

  return (
    <p className="drills-badges">
      <span className="drills-badge drills-badge-streak">
        STREAK: {days} {days === 1 ? "DAY" : "DAYS"}
      </span>
      <span className="drills-badge drills-badge-done">
        {done} / {slugs.length} DONE
      </span>
    </p>
  );
}
