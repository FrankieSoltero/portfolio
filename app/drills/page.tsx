// app/drills/page.tsx
// Index page: every drill in order. A static server component; the section shell
// (header, main, footer) comes from app/drills/layout.tsx.

import type { Metadata } from "next";
import { getAllDrills } from "@/lib/drills";
import { DRILLS_INTRO, DrillList } from "@/drills/components/DrillList";

export const metadata: Metadata = {
  description: DRILLS_INTRO,
};

export default function DrillsIndexPage(): React.JSX.Element {
  const drills = getAllDrills().map((d) => d.meta);
  return <DrillList drills={drills} />;
}
