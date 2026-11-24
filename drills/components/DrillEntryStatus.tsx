"use client";
// drills/components/DrillEntryStatus.tsx
// One drill's status on the /drills index: DONE, DONE WITH HELP (completed after the fix
// was revealed), TODAY (the first drill in order not yet done) or nothing. Until stored
// progress is read the span is rendered empty so the server and first client render match.

import { drillStatus, todaysDrill } from "@/drills/progress";
import { useProgress } from "@/drills/useProgress";

const BASE = "drills-entry-status";

export function DrillEntryStatus({
  slug,
  slugs,
}: {
  slug: string;
  slugs: string[];
}): React.JSX.Element {
  const { progress, ready } = useProgress();

  if (!ready) return <span className={BASE} />;

  const status = drillStatus(progress, slug);
  if (status === "done") return <span className={`${BASE} drills-status-done`}>DONE</span>;
  if (status === "done-with-help") {
    return <span className={`${BASE} drills-status-helped`}>DONE WITH HELP</span>;
  }
  if (todaysDrill(slugs, progress) === slug) {
    return <span className={`${BASE} drills-status-today`}>TODAY</span>;
  }
  return <span className={BASE} />;
}
