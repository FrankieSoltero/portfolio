'use client';

// Shown when the room planner fails to load or throws while rendering. The error's message is
// never shown on the page; it goes to the browser console only.
//
// "Try again" reloads the whole page instead of calling Next's `reset`: `next/dynamic` wraps the
// planner in a single React.lazy, which caches a rejected chunk import and re-throws it on every
// later render, so `reset` alone would bring this screen straight back.

import { useEffect, type CSSProperties, type JSX } from 'react';

/** Same ground and text colours as the loading state in PlannerLoader.tsx. */
const ALERT_STYLE: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  lineHeight: 1.5,
  color: '#f4f4f4',
  background: '#1a1c2c',
};

/** The props Next passes to an error boundary; `reset` is accepted but deliberately unused. */
interface RoomPlannerErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RoomPlannerError({ error }: RoomPlannerErrorProps): JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" style={ALERT_STYLE}>
      <p style={{ margin: '0 0 12px' }}>The room planner failed to load.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  );
}
