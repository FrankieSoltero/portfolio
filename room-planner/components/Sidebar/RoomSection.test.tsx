import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rectangleSize, setRectangleSize, startingShape } from '../../domain/outline';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { Header } from '../Header';
import { RoomSection } from './RoomSection';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Stores a rectangle `inches` wide through the outline, as the Width input does. */
function setWidth(inches: number): void {
  const { applyOutline, room } = usePlanStore.getState();
  applyOutline(setRectangleSize(room.outline, { w: inches }));
}

/** The stored rectangle's size, or null when the outline is not a rectangle. */
function storedSize(): { w: number; l: number } | null {
  return rectangleSize(usePlanStore.getState().room.outline);
}

/** Replaces the seed room's outline with an L-shape of the same 144 × 168 in bounds. */
function makeLShape(): void {
  let n = 0;
  usePlanStore.getState().applyOutline({ ok: true, outline: startingShape('l-shape', 144, 168, () => `l${++n}`) });
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLInputElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

describe('Header', () => {
  it('renders the brand, the Units label and a ft / in | m / cm control bound to units', () => {
    render(<Header />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('nav');
    expect(screen.getByText('Room planner')).toHaveClass('nav-brand');
    expect(screen.getByText('Units')).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Units' });
    expect(group).toHaveClass('seg');
    expect(screen.getByRole('radio', { name: 'ft / in' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'm / cm' })).not.toBeChecked();
  });

  it('switches units to m on clicking m / cm and leaves the stored room unchanged', async () => {
    const before = usePlanStore.getState().room;
    render(<Header />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'm / cm' }));
    expect(usePlanStore.getState().units).toBe('m');
    expect(usePlanStore.getState().room).toEqual(before);
    expect(screen.getByRole('radio', { name: 'm / cm' })).toBeChecked();
  });
});

describe('RoomSection', () => {
  it('renders a section headed 01 (in .sidebar-heading-num) then Room', () => {
    const { container } = render(<RoomSection />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section).toHaveClass('sidebar-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading).toHaveClass('sidebar-heading');
    const num = heading.querySelector('.sidebar-heading-num');
    expect(num).toHaveTextContent('01');
    expect(heading).toHaveTextContent(/^01Room$/);
  });

  it('shows feet values, ft suffix, 0.25 step and labelled Width / Length / Ceiling inputs', () => {
    const { container } = render(<RoomSection />);
    const fields = [
      ['Width', '12'],
      ['Length', '14'],
      ['Ceiling', '8'],
    ] as const;
    for (const [label, value] of fields) {
      const el = input(label);
      expect(el).toHaveAttribute('type', 'number');
      expect(el).toHaveClass('input');
      expect(el.value).toBe(value);
      expect(el).toHaveAttribute('step', '0.25');
      const labelEl = container.querySelector(`label[for="${el.id}"]`);
      expect(labelEl).toHaveTextContent(label);
      const suffix = el.parentElement?.querySelector('.input-suffix');
      expect(suffix).toHaveTextContent(/^ft$/);
      expect(suffix).toHaveAttribute('aria-hidden', 'true');
    }
    expect(container.querySelector('.field-grid-3')).not.toBeNull();
  });

  it('shows metre values, m suffix and 0.05 step when units are m', () => {
    usePlanStore.getState().setUnits('m');
    render(<RoomSection />);
    const fields = [
      ['Width', '3.66'],
      ['Length', '4.27'],
      ['Ceiling', '2.44'],
    ] as const;
    for (const [label, value] of fields) {
      const el = input(label);
      expect(el.value).toBe(value);
      expect(el).toHaveAttribute('step', '0.05');
      expect(el.parentElement?.querySelector('.input-suffix')).toHaveTextContent(/^m$/);
    }
  });

  it('re-seeds the inputs when units change while mounted', () => {
    render(<RoomSection />);
    act(() => usePlanStore.getState().setUnits('m'));
    expect(input('Width').value).toBe('3.66');
    expect(input('Width')).toHaveAttribute('step', '0.05');
  });

  it('re-seeds on a units change even when the draft happens to parse to the stored length', () => {
    setWidth(100);
    render(<RoomSection />);
    // 2.540 ft is out of range, so the store keeps 100 in — which is exactly 2.540 m.
    typeRaw(input('Width'), '2.540');
    expect(storedSize()?.w).toBe(100);
    act(() => usePlanStore.getState().setUnits('m'));
    expect(input('Width').value).toBe('2.54');
  });

  it('writes a valid width to the store immediately', () => {
    render(<RoomSection />);
    typeRaw(input('Width'), '10');
    expect(storedSize()?.w).toBe(120);
    expect(input('Width').value).toBe('10');
  });

  it('keeps a partial entry in the input while storing its parsed value', () => {
    render(<RoomSection />);
    const el = input('Width');
    // jsdom sanitises "10." on a number input to ""; Chrome reports the typed text.
    // Force the raw value so the component's handling of the typed string is what is tested.
    Object.defineProperty(el, 'value', { configurable: true, writable: true, value: '10.' });
    fireEvent.change(el);
    expect(storedSize()?.w).toBe(120);
    // React re-renders with draft "10."; the controlled value must not be re-seeded to "10".
    expect(el.value).toBe('10.');
  });

  it('leaves the room unchanged and keeps the typed text for an out-of-range entry', () => {
    const before = usePlanStore.getState().room;
    render(<RoomSection />);
    typeRaw(input('Width'), '2');
    expect(usePlanStore.getState().room).toEqual(before);
    expect(input('Width').value).toBe('2');
  });

  it('re-seeds the width input when the stored width changes from outside', () => {
    render(<RoomSection />);
    act(() => setWidth(150));
    expect(input('Width').value).toBe('12.5');
  });

  it('re-seeds an out-of-range draft when the stored value changes from outside', () => {
    render(<RoomSection />);
    typeRaw(input('Width'), '2');
    act(() => setWidth(150));
    expect(input('Width').value).toBe('12.5');
  });

  it('writes a valid length through the outline, keeping the width and height', () => {
    render(<RoomSection />);
    typeRaw(input('Length'), '10');
    expect(storedSize()).toEqual({ w: 144, l: 120 });
    expect(usePlanStore.getState().room.height).toBe(96);
    expect(input('Length').value).toBe('10');
  });

  it('writes a valid ceiling height with setRoomHeight, leaving the outline unchanged', () => {
    const outline = usePlanStore.getState().room.outline;
    render(<RoomSection />);
    typeRaw(input('Ceiling'), '9');
    expect(usePlanStore.getState().room.height).toBe(108);
    expect(usePlanStore.getState().room.outline).toBe(outline);
    expect(input('Ceiling').value).toBe('9');
  });

  it('leaves the height unchanged and keeps the typed text for an out-of-range ceiling', () => {
    render(<RoomSection />);
    typeRaw(input('Ceiling'), '2');
    expect(usePlanStore.getState().room.height).toBe(96);
    expect(input('Ceiling').value).toBe('2');
  });

  it('re-seeds the ceiling input when the stored height changes from outside', () => {
    render(<RoomSection />);
    act(() => usePlanStore.getState().setRoomHeight(102));
    expect(input('Ceiling').value).toBe('8.5');
  });

  it('shows only the Ceiling input while the room is not a rectangle', () => {
    makeLShape();
    render(<RoomSection />);
    expect(screen.queryByLabelText('Width')).toBeNull();
    expect(screen.queryByLabelText('Length')).toBeNull();
    expect(input('Ceiling').value).toBe('8');
  });

  it('shows Width and Length again, seeded from the outline, once the room is a rectangle again', () => {
    makeLShape();
    render(<RoomSection />);
    act(() => {
      usePlanStore.getState().applyOutline({
        ok: true,
        outline: [{ id: 'r1', x: 0, y: 0 }, { id: 'r2', x: 120, y: 0 }, { id: 'r3', x: 120, y: 96 }, { id: 'r4', x: 0, y: 96 }],
      });
    });
    expect(input('Width').value).toBe('10');
    expect(input('Length').value).toBe('8');
  });

  it('shows the floor area of a room that is not a rectangle', () => {
    makeLShape();
    render(<RoomSection />);
    // 144 × 168 less the 72 × 84 cut-away is 18144 sq in, 126 sq ft.
    expect(screen.getByText(/^Floor area/).textContent).toBe('Floor area 126 sq ft.');
  });

  it('shows the floor area line in square feet', () => {
    render(<RoomSection />);
    const note = screen.getByText(/^Floor area/);
    expect(note).toHaveClass('note');
    expect(note.textContent).toBe('Floor area 168 sq ft.');
  });

  it('shows the floor area in m² when units are m', () => {
    usePlanStore.getState().setUnits('m');
    render(<RoomSection />);
    expect(screen.getByText(/^Floor area/).textContent).toBe('Floor area 15.6 m².');
  });
});
