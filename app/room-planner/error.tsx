'use client';

// Shown when the room planner fails to load or throws while rendering. The error's message is
// never shown on the page; it goes to the browser console only.

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

interface RoomPlannerErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RoomPlannerError({ error, reset }: RoomPlannerErrorProps): JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" style={ALERT_STYLE}>
      <p style={{ margin: '0 0 12px' }}>The room planner failed to load.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
