import { useState, type JSX } from 'react';
import { Header } from './components/Header';
import { Notice } from './components/Notice';
import { SelectionBar } from './components/SelectionBar';
import { SharedBanner } from './components/SharedBanner';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Stage } from './components/Stage/Stage';
import { TopBar } from './components/TopBar';
import { useHistoryFieldGroups } from './hooks/useHistoryFieldGroups';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePlanPersistence } from './hooks/usePlanPersistence';
import { createMockProductLookup } from './services/mockProductLookup';
import type { PlanStore } from './services/planStorage';
import './styles/app.css';

/**
 * The workspace shell: header, notice bar, shared-plan banner, then a sidebar and the main column
 * (top bar, stage, selection bar). The product lookup provider is created once per mount; keyboard shortcuts are
 * global, and typing in a text field is one undo step. The plan is loaded from `planStore` and
 * autosaved to it; until the load has been applied only a loading message is shown, so the starting
 * plan never flashes before a saved one.
 */
export default function App({ planStore }: { planStore: PlanStore }): JSX.Element {
  const [lookup] = useState(() => createMockProductLookup());
  const { ready } = usePlanPersistence(planStore);
  useKeyboardShortcuts();
  useHistoryFieldGroups();

  if (!ready) {
    return (
      <div className="plan-loading" role="status">
        Loading your plan…
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <Notice />
      <SharedBanner planStore={planStore} />
      <div className="app-body">
        <Sidebar lookup={lookup} planStore={planStore} />
        <main className="app-main">
          <TopBar />
          <Stage />
          <SelectionBar />
        </main>
      </div>
    </div>
  );
}
