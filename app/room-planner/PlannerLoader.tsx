'use client';

// Loads the room planner in the browser only. `next/dynamic` with `ssr: false` must live in a
// client component, so this sits between the server page and the planner.

import dynamic from 'next/dynamic';
import type { CSSProperties, JSX } from 'react';

/** The site's ground and text colours (app/globals.css); contrast about 15:1. */
const STATUS_STYLE: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  lineHeight: 1.5,
  color: '#f4f4f4',
  background: '#1a1c2c',
};

/** Shown in the server HTML and until the planner's code has downloaded. */
export function PlannerLoading(): JSX.Element {
  return (
    <p role="status" style={STATUS_STYLE}>
      Loading the room planner…
    </p>
  );
}

const PlannerRoot = dynamic(() => import('@/room-planner/PlannerRoot'), {
  ssr: false,
  loading: PlannerLoading,
});

export default function PlannerLoader(): JSX.Element {
  return <PlannerRoot />;
}
