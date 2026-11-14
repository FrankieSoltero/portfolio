import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlannerRoot from './PlannerRoot';
import { usePlanStore } from './state/planStore';
import { useUiStore } from './state/uiStore';

// The 3D views draw on canvases jsdom cannot provide; inert stand-ins keep the lazy chunk resolvable.
vi.mock('./components/Stage/ThreeView', () => ({
  default: (): JSX.Element => <div data-testid="realistic-marker" />,
}));

vi.mock('./components/Stage/BlueprintView', () => ({
  BlueprintView: (): JSX.Element => <div data-testid="blueprint-marker" />,
}));

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

/** The component's source, read as text: the Vitest config sets `css: false`, so imports are inert. */
const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PlannerRoot.tsx'),
  'utf8',
);

describe('PlannerRoot', () => {
  it('renders the app shell and its header inside exactly one room-planner wrapper', () => {
    const { container } = render(<PlannerRoot />);
    const wrappers = container.querySelectorAll('.room-planner');
    expect(wrappers).toHaveLength(1);
    const [wrapper] = wrappers;
    expect(container.firstElementChild).toBe(wrapper);
    expect(wrapper?.querySelector('.app')).toBeInTheDocument();
    expect(wrapper?.querySelector('header.nav')).toHaveTextContent('Room planner');
  });

  it('takes the wrapper class from PLANNER_ROOT_CLASS, not a second string literal', () => {
    expect(SOURCE).toMatch(/import\s*\{\s*PLANNER_ROOT_CLASS\s*\}\s*from\s*'\.\/styles\/tokens';/);
    expect(SOURCE).toMatch(/className=\{PLANNER_ROOT_CLASS\}/);
    expect(SOURCE).not.toMatch(/['"`]room-planner['"`]/);
  });

  it('imports the fonts and the planner stylesheets in the standalone entry order', () => {
    const sideEffectImports = Array.from(
      SOURCE.matchAll(/^import\s+'([^']+)';$/gm),
      (match) => match[1],
    );
    expect(sideEffectImports).toEqual([
      '@fontsource/barlow/400.css',
      '@fontsource/barlow/500.css',
      '@fontsource/barlow/700.css',
      '@fontsource/barlow-condensed/400.css',
      '@fontsource/barlow-condensed/600.css',
      './styles/industry.css',
      './styles/app.css',
    ]);
  });

  it('loads nothing from the network: no http:// or https:// anywhere in the file', () => {
    expect(SOURCE).not.toMatch(/https?:\/\//);
  });
});
