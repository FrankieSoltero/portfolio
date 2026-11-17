// app/room-planner/page.tsx
// The Room Planner route. A server component: it only sets the metadata and hands over to the
// client-only loader, so the planner itself is never server-rendered.

import type { Metadata } from 'next';
import type { JSX } from 'react';
import PlannerLoader from './PlannerLoader';

export const metadata: Metadata = {
  title: 'Room Planner',
  description: 'Lay out a room to scale, place furniture, and check the fit in 3D.',
  // The tab icon comes from the root layout (public/favicon.svg).
};

export default function RoomPlannerPage(): JSX.Element {
  return <PlannerLoader />;
}
