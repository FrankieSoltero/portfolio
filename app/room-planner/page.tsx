// app/room-planner/page.tsx
// The Room Planner route. A server component: it only sets the metadata and hands over to the
// client-only loader, so the planner itself is never server-rendered.

import type { Metadata } from 'next';
import type { JSX } from 'react';
import PlannerLoader from './PlannerLoader';

export const metadata: Metadata = {
  title: 'Room Planner',
  description: 'Lay out a room to scale, place furniture, and check the fit in 3D.',
  alternates: { canonical: '/room-planner' },
  // An empty data URL stops the browser requesting /favicon.ico, which would log a console error.
  icons: { icon: 'data:,' },
};

export default function RoomPlannerPage(): JSX.Element {
  return <PlannerLoader />;
}
