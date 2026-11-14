import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CSSProperties } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import RoomPlannerError from './error';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'error.tsx'), 'utf8');

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
  const { container } = render(<div style={style} />);
  const reference = container.firstElementChild as HTMLElement;
  const result = declarations(reference);
  container.remove();
  return result;
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  // The component logs the error on purpose; capture it so the test output stays clean.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('room-planner error screen', () => {
  it("is a client component: its first line is 'use client'", () => {
    expect(SOURCE.split('\n')[0]).toBe("'use client';");
  });

  it('renders an alert with the failure text, a Try again button and the loading-state style', () => {
    const expected = expectedDeclarations(EXPECTED_STYLE);
    render(<RoomPlannerError error={new Error('boom')} reset={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert.tagName).toBe('DIV');
    expect(alert).toHaveTextContent('The room planner failed to load.');
    expect(declarations(alert)).toEqual(expected);

    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button).toHaveAttribute('type', 'button');
    expect(alert).toContainElement(button);
  });

  it('calls reset once when Try again is clicked', async () => {
    const reset = vi.fn();
    render(<RoomPlannerError error={new Error('boom')} reset={reset} />);
    expect(reset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps the error message out of the page and sends the error to console.error once', () => {
    const error = new Error('secret detail');
    render(<RoomPlannerError error={error} reset={() => {}} />);
    expect(document.body).not.toHaveTextContent('secret detail');
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
