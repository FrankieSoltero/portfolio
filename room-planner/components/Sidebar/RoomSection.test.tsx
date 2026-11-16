import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rectangleSize, setRectangleSize, startingShape } from '../../domain/outline';
import { createInitialDocument } from '../../domain/catalog';
import { boundsOf } from '../../domain/polygon';
import type { Door } from '../../domain/types';
import { clearHistory, useHistoryStore } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { Header } from '../Header';
import { RoomSection } from './RoomSection';

/** A 32 in door 20 in along the top wall c1: it spans x 20–52. */
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };

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

/**
 * The Room section's status element for refused edits. In room mode the section also has the
 * armed-tool status of the doors, windows and obstacles controls, so this picks the room-problem one.
 */
function problemStatus(): HTMLElement {
  const status = screen.getAllByRole('status').find((el) => el.classList.contains('room-problem'));
  if (status === undefined) throw new Error('missing room-problem status');
  return status;
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

  describe('Undo and Redo', () => {
    beforeEach(() => {
      clearHistory();
    });

    /** Makes one undo step (the room becomes 180 in wide) and returns the room before it. */
    function oneStep() {
      const before = usePlanStore.getState().room;
      act(() => setWidth(180));
      return before;
    }

    const undoButton = () => screen.getByRole('button', { name: 'Undo' });
    const redoButton = () => screen.getByRole('button', { name: 'Redo' });

    it('renders Undo then Redo as btn buttons after the brand and before the units control', () => {
      render(<Header />);
      const header = screen.getByRole('banner');
      const buttons = within(header).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['Undo', 'Redo']);
      for (const b of buttons) {
        expect(b).toHaveAttribute('type', 'button');
        expect(b).toHaveClass('btn');
      }
      const wrapper = buttons[0].parentElement;
      expect(wrapper).toHaveClass('header-history');
      expect(buttons[1].parentElement).toBe(wrapper);
      const children = [...header.children];
      const brand = screen.getByText('Room planner');
      const unitsNote = screen.getByText('Units');
      const units = screen.getByRole('radiogroup', { name: 'Units' });
      expect(children.indexOf(brand)).toBe(0);
      expect(children.indexOf(wrapper as Element)).toBe(1);
      expect(children.indexOf(unitsNote)).toBe(2);
      expect(children.indexOf(units)).toBeGreaterThan(children.indexOf(unitsNote));
    });

    it('greys out Undo with nothing to undo, keeps it focusable, and a click changes nothing', async () => {
      render(<Header />);
      const before = usePlanStore.getState();
      const undo = undoButton();
      expect(undo).toHaveAttribute('aria-disabled', 'true');
      expect(undo).not.toHaveAttribute('disabled');
      act(() => undo.focus());
      expect(undo).toHaveFocus();
      await userEvent.setup().click(undo);
      expect(usePlanStore.getState().room).toBe(before.room);
      expect(usePlanStore.getState().items).toBe(before.items);
      expect(useHistoryStore.getState().lastAnnouncement).toBeNull();
    });

    it('enables Undo after one step; clicking it restores the earlier plan', async () => {
      render(<Header />);
      const before = oneStep();
      expect(undoButton()).not.toHaveAttribute('aria-disabled');
      await userEvent.setup().click(undoButton());
      expect(usePlanStore.getState().room).toBe(before);
      expect(undoButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('greys out Redo until an undo, then clicking it puts the step back', async () => {
      render(<Header />);
      const user = userEvent.setup();
      expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
      expect(redoButton()).not.toHaveAttribute('disabled');
      oneStep();
      const after = usePlanStore.getState().room;
      expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
      await user.click(undoButton());
      expect(redoButton()).not.toHaveAttribute('aria-disabled');
      await user.click(redoButton());
      expect(usePlanStore.getState().room).toBe(after);
      expect(redoButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('a greyed-out Redo click changes nothing', async () => {
      render(<Header />);
      oneStep();
      const before = usePlanStore.getState().room;
      await userEvent.setup().click(redoButton());
      expect(usePlanStore.getState().room).toBe(before);
      expect(useHistoryStore.getState().lastAnnouncement).toBeNull();
    });

    it('keeps focus on Undo after clicking it undoes the only step', async () => {
      render(<Header />);
      oneStep();
      act(() => undoButton().focus());
      await userEvent.setup().click(undoButton());
      expect(undoButton()).toHaveFocus();
      expect(undoButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('hints the keyboard shortcuts on both buttons', () => {
      render(<Header />);
      expect(undoButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
      expect(redoButton()).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z Control+Y');
    });

    it('has an empty, visually hidden status element before any undo', () => {
      render(<Header />);
      const status = within(screen.getByRole('banner')).getByRole('status');
      expect(status).toHaveClass('visually-hidden');
      expect(status).toBeEmptyDOMElement();
    });

    it('announces Undone then Redone in a new status element each time, so two undos are both announced', async () => {
      render(<Header />);
      const user = userEvent.setup();
      oneStep();
      act(() => setWidth(200));
      await user.click(undoButton());
      const first = screen.getByRole('status');
      expect(first).toHaveTextContent(/^Undone$/);
      expect(first).toHaveClass('visually-hidden');
      await user.click(undoButton());
      const second = screen.getByRole('status');
      expect(second).toHaveTextContent(/^Undone$/);
      expect(second).not.toBe(first);
      await user.click(redoButton());
      const third = screen.getByRole('status');
      expect(third).toHaveTextContent(/^Redone$/);
      expect(third).not.toBe(second);
    });

    describe('styles (sidebar.css)', () => {
      // Vitest runs from the repo root; under jsdom import.meta.url is not a file URL.
      const css = readFileSync(resolve(process.cwd(), 'room-planner/components/Sidebar/sidebar.css'), 'utf8');
      /** The declarations of the rule for `selector`, whitespace collapsed. */
      const rule = (selector: string): string => {
        const at = css.indexOf(`\n${selector} {`);
        if (at < 0) throw new Error(`no rule ${selector}`);
        return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at)).replace(/\s+/g, ' ').trim();
      };

      it('lays the two buttons out in a row with a small gap, pushing the units control to the far right', () => {
        expect(rule('.header-history')).toBe('display: flex; gap: var(--space-2); margin-right: auto;');
      });

      it('sits the buttons beside the title: in the header the brand no longer takes the free space', () => {
        // Beats industry.css `.nav-brand { margin-right: auto }` by specificity (two classes to one).
        expect(rule('.app-header > .nav-brand')).toBe('margin-right: var(--space-4);');
      });

      it('hides the status element visually', () => {
        expect(rule('.visually-hidden')).toBe(
          'position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; ' +
            'clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;',
        );
      });

      it('greys out an aria-disabled button like .btn:disabled', () => {
        expect(rule('.btn[aria-disabled="true"]')).toBe('opacity: 0.45; cursor: not-allowed;');
      });
    });
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

  it('adds the room-editing help to the note in room mode', () => {
    useUiStore.getState().setMode('room');
    render(<RoomSection />);
    expect(screen.getByText(/^Floor area/).textContent).toBe(
      'Floor area 168 sq ft. Drag a wall to move it. Drag a corner to change an angle. Double-click a wall to add a corner. Click a length to type it. Hold Alt to turn off angle snapping.',
    );
  });

  it('has an Edit room button, not a pressed toggle, that switches to room mode', async () => {
    render(<RoomSection />);
    const button = screen.getByRole('button', { name: 'Edit room' });
    expect(button).not.toHaveAttribute('aria-pressed');
    await userEvent.setup().click(button);
    expect(useUiStore.getState().mode).toBe('room');
  });

  it('reads Done, not a pressed toggle, in room mode and switches back to furnish mode', async () => {
    useUiStore.getState().setMode('room');
    render(<RoomSection />);
    expect(screen.queryByRole('button', { name: 'Edit room' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Done' });
    expect(button).not.toHaveAttribute('aria-pressed');
    await userEvent.setup().click(button);
    expect(useUiStore.getState().mode).toBe('furnish');
    expect(screen.getByRole('button', { name: 'Edit room' })).not.toHaveAttribute('aria-pressed');
  });

  it('lists the walls with their lengths', () => {
    render(<RoomSection />);
    expect(input('Wall 1').value).toBe('12');
    expect(input('Wall 4').value).toBe('14');
  });

  it('shows no problem text while roomProblem is null, in a status region', () => {
    render(<RoomSection />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows roomProblem in the status region', () => {
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    render(<RoomSection />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Walls cannot cross\.$/);
    expect(status).toHaveClass('room-problem');
    act(() => useUiStore.getState().setRoomProblem(null));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the reason when a typed wall length is refused', () => {
    render(<RoomSection />);
    typeRaw(input('Wall 1'), '0.25');
    expect(screen.getByRole('status')).toHaveTextContent('That wall would be too short.');
  });

  it('shows the reason when adding a corner from the keyboard is refused', async () => {
    usePlanStore.getState().applyOutline({
      ok: true,
      outline: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 10, y: 0 }, { id: 'n3', x: 10, y: 100 }, { id: 'n4', x: 0, y: 100 }],
    });
    useUiStore.getState().setMode('room');
    render(<RoomSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add a corner to wall 1' }));
    expect(problemStatus()).toHaveTextContent('That wall would be too short.');
  });

  it('offers Rectangle, L-shape and Notched in a group labelled Start from a shape', () => {
    render(<RoomSection />);
    const group = screen.getByRole('group', { name: 'Start from a shape' });
    expect(group).toHaveClass('shape-buttons');
    const names = within(group).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Rectangle', 'L-shape', 'Notched']);
  });

  it.each([
    ['L-shape', [[12, 24], [72, 24], [72, 72], [132, 72], [132, 120], [12, 120]]],
    ['Notched', [[12, 24], [57, 24], [57, 36], [87, 36], [87, 24], [132, 24], [132, 120], [12, 120]]],
    ['Rectangle', [[12, 24], [132, 24], [132, 120], [12, 120]]],
  ] as const)('replaces the outline with %s sized from the current bounds, with fresh ids', async (name, xy) => {
    // A 120 × 96 L-shape away from the origin: its bounding box sizes and places the shape.
    let n = 0;
    usePlanStore.getState().applyOutline({
      ok: true,
      outline: startingShape('l-shape', 120, 96, () => `old${++n}`).map((c) => ({ ...c, x: c.x + 12, y: c.y + 24 })),
    });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('old1');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name }));
    const corners = usePlanStore.getState().room.outline;
    expect(corners.map((c) => [c.x, c.y])).toEqual(xy);
    const ids = corners.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(useUiStore.getState().roomProblem).toBeNull();
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(problemStatus()).toBeEmptyDOMElement();
  });

  it('keeps the room where it is: a shape chosen after the corners moved starts at the old bounding box', async () => {
    usePlanStore.getState().applyOutline({
      ok: true,
      outline: startingShape('rectangle', 144, 168, () => crypto.randomUUID()).map((c) => ({ ...c, x: c.x + 24, y: c.y + 12 })),
    });
    const before = boundsOf(usePlanStore.getState().room.outline);
    expect([before.minX, before.minY]).toEqual([24, 12]);
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'L-shape' }));
    const corners = usePlanStore.getState().room.outline;
    expect(corners).toHaveLength(6);
    expect([corners[0].x, corners[0].y]).toEqual([24, 12]);
    expect(boundsOf(corners)).toEqual(before);
  });

  it('clears the selected wall when a starting shape is accepted', async () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectWall('c1');
    expect(useUiStore.getState().selectedWallId).toBe('c1');
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'L-shape' }));
    expect(usePlanStore.getState().room.outline).toHaveLength(6);
    expect(useUiStore.getState().selectedWallId).toBeNull();
  });

  it('applies a starting shape in furnish mode too', async () => {
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'L-shape' }));
    expect(usePlanStore.getState().room.outline).toHaveLength(6);
    expect(screen.queryByLabelText('Width')).toBeNull();
    expect(input('Ceiling').value).toBe('8');
  });

  it('refuses a starting shape that would not be a valid room and shows why', async () => {
    // A flat triangle only 4 in deep: a 100 × 4 rectangle would have 4 in walls.
    usePlanStore.getState().applyOutline({
      ok: true,
      outline: [{ id: 't1', x: 0, y: 0 }, { id: 't2', x: 100, y: 0 }, { id: 't3', x: 50, y: 4 }],
    });
    const before = usePlanStore.getState().room.outline;
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rectangle' }));
    expect(usePlanStore.getState().room.outline).toEqual(before);
    expect(screen.getByRole('status')).toHaveTextContent('That wall would be too short.');
  });

  it('refuses a width that leaves a door without room on its wall and shows why; an accepted width clears it', () => {
    usePlanStore.getState().reset({ ...createInitialDocument(), openings: [D1] });
    const before = usePlanStore.getState().room;
    render(<RoomSection />);
    typeRaw(input('Width'), '4');
    expect(usePlanStore.getState().room).toBe(before);
    expect(screen.getByRole('status')).toHaveTextContent(/^That would leave a door or window without room on its wall\.$/);
    typeRaw(input('Width'), '10');
    expect(storedSize()?.w).toBe(120);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('refuses a starting shape while the room has a door, shows why and keeps the corner selection', async () => {
    usePlanStore.getState().reset({ ...createInitialDocument(), openings: [D1] });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('c2');
    const before = usePlanStore.getState();
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'L-shape' }));
    expect(usePlanStore.getState()).toBe(before);
    expect(problemStatus()).toHaveTextContent(/^Remove the doors and windows before starting from a shape\.$/);
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
  });

  it('shows the doors, windows and obstacles controls after the wall list in room mode only', () => {
    const { container } = render(<RoomSection />);
    expect(screen.queryByRole('group', { name: 'Add to the room' })).toBeNull();
    act(() => useUiStore.getState().setMode('room'));
    const walls = screen.getByRole('group', { name: 'Wall lengths' });
    const adds = screen.getByRole('group', { name: 'Add to the room' });
    expect(walls.compareDocumentPosition(adds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.room-features')).not.toBeNull();
  });

  it('shows a refused door width in the Room status element and keeps the typed text', async () => {
    usePlanStore.getState().reset({ ...createInitialDocument(), openings: [D1] });
    useUiStore.getState().setMode('room');
    render(<RoomSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Door on wall 1' }));
    const fields = screen.getByRole('group', { name: 'Door on wall 1' });
    const width = within(fields).getByLabelText('Width') as HTMLInputElement;
    typeRaw(width, '8');
    expect(usePlanStore.getState().openings).toEqual([D1]);
    expect(width.value).toBe('8');
    expect(problemStatus()).toHaveTextContent(/^That size is not allowed\.$/);
  });

  it('places a door from the sidebar by keyboard, then refuses a starting shape and shows why', async () => {
    useUiStore.getState().setMode('room');
    render(<RoomSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add door' }));
    screen.getByRole('button', { name: 'Place the door on wall 1' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Door on wall 1' })).toHaveAttribute('aria-pressed', 'true');
    const before = usePlanStore.getState().room.outline;
    await user.click(screen.getByRole('button', { name: 'L-shape' }));
    expect(usePlanStore.getState().room.outline).toBe(before);
    expect(problemStatus()).toHaveTextContent(/^Remove the doors and windows before starting from a shape\.$/);
  });
});
