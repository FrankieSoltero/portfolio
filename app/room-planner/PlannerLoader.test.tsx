import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import type { CSSProperties, JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PlannerLoader, { PlannerLoading } from './PlannerLoader';
import RoomPlannerPage, { metadata } from './page';

// The real planner needs canvases and stores; an inert stand-in lets these tests see when the
// loader has swapped its loading state for the module it loaded.
vi.mock('@/room-planner/PlannerRoot', () => ({
  default: (): JSX.Element => <div data-testid="planner-root-stand-in" />,
}));

const HERE = dirname(fileURLToPath(import.meta.url));
const LOADER_SOURCE = readFileSync(join(HERE, 'PlannerLoader.tsx'), 'utf8');
const PAGE_SOURCE = readFileSync(join(HERE, 'page.tsx'), 'utf8');

/** The brief's exact loading/error text style. */
const EXPECTED_STYLE: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  lineHeight: 1.5,
  color: '#f4f4f4',
  background: '#1a1c2c',
};

/** An element's inline declarations, sorted, so two styles compare by content rather than order. */
function declarations(element: HTMLElement): string[] {
  return element.style.cssText
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .sort();
}

/** The declarations React writes for `style`, normalised by jsdom exactly as the component's are. */
function expectedDeclarations(style: CSSProperties): string[] {
  const { container } = render(<p style={style} />);
  const reference = container.firstElementChild as HTMLElement;
  const result = declarations(reference);
  container.remove();
  return result;
}

describe('PlannerLoading', () => {
  it('renders one status paragraph with the exact text and the exact inline style', () => {
    const expected = expectedDeclarations(EXPECTED_STYLE);
    render(<PlannerLoading />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    const [status] = statuses as [HTMLElement];
    expect(status.tagName).toBe('P');
    expect(status.textContent).toBe('Loading the room planner…');
    expect(declarations(status)).toEqual(expected);
  });
});

describe('PlannerLoader', () => {
  it("is a client component: its first line is 'use client'", () => {
    expect(LOADER_SOURCE.split('\n')[0]).toBe("'use client';");
  });

  it('turns server rendering off for the dynamically loaded planner', () => {
    expect(LOADER_SOURCE).toMatch(/import dynamic from 'next\/dynamic';/);
    expect(LOADER_SOURCE).toMatch(/\bssr: false\b/);
    expect(LOADER_SOURCE).toMatch(/\bloading: PlannerLoading\b/);
  });

  it('shows the loading state first, then replaces it with the planner root module', async () => {
    render(<PlannerLoader />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the room planner…');
    expect(screen.queryByTestId('planner-root-stand-in')).not.toBeInTheDocument();

    expect(await screen.findByTestId('planner-root-stand-in')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('room-planner page', () => {
  it('is a server component: it has no use client directive', () => {
    expect(PAGE_SOURCE).not.toMatch(/['"]use client['"]/);
  });

  it('renders the loader and nothing else', () => {
    const element = RoomPlannerPage();
    expect(element.type).toBe(PlannerLoader);
    expect(element.props).toEqual({});
  });

  it('exports the exact metadata', () => {
    expect(metadata).toEqual({
      title: 'Room Planner',
      description: 'Lay out a room to scale, place furniture, and check the fit in 3D.',
      alternates: { canonical: '/room-planner' },
      icons: { icon: 'data:,' },
    });
  });
});
