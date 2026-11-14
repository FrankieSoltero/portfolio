import { useState, type JSX } from 'react';
import { Header } from './components/Header';
import { SelectionBar } from './components/SelectionBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Stage } from './components/Stage/Stage';
import { TopBar } from './components/TopBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { createMockProductLookup } from './services/mockProductLookup';
import './styles/app.css';

/**
 * The workspace shell: header over a sidebar and the main column (top bar, stage, selection
 * bar). The product lookup provider is created once per mount; keyboard shortcuts are global.
 */
export default function App(): JSX.Element {
  const [lookup] = useState(() => createMockProductLookup());
  useKeyboardShortcuts();

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar lookup={lookup} />
        <main className="app-main">
          <TopBar />
          <Stage />
          <SelectionBar />
        </main>
      </div>
    </div>
  );
}
