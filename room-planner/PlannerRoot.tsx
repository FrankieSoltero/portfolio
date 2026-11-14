'use client';

import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/600.css';
import './styles/industry.css';
import './styles/app.css';
import { useState, type JSX } from 'react';
import App from './App';
import { createBrowserPlanStore } from './services/browserPlanStore';
import { PLANNER_ROOT_CLASS } from './styles/tokens';

/**
 * The planner's entry inside the portfolio: loads its self-hosted fonts and stylesheets (in the
 * standalone entry's order) and renders the app inside the wrapper element that every planner
 * style rule and the canvas colour-token reader are scoped to. Next.js supplies StrictMode and
 * the React root, so neither is created here. The plan is kept in this browser's storage through
 * one browser plan store, created once per mount.
 */
export default function PlannerRoot(): JSX.Element {
  const [planStore] = useState(() => createBrowserPlanStore());
  return (
    <div className={PLANNER_ROOT_CLASS}>
      <App planStore={planStore} />
    </div>
  );
}
