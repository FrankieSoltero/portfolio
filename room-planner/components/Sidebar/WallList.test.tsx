import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialDocument } from '../../domain/catalog';
import { setWallLength, startingShape } from '../../domain/outline';
import type { Corner, Door } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { WallList } from './WallList';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLInputElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

function outline(): Corner[] {
  return usePlanStore.getState().room.outline;
}

function storeOutline(corners: Corner[]): void {
  usePlanStore.getState().applyOutline({ ok: true, outline: corners });
}

/** Replaces the seed room with an L-shape of the same 144 × 168 in bounds; corner ids l1…l6. */
function makeLShape(): void {
  let n = 0;
  storeOutline(startingShape('l-shape', 144, 168, () => `l${++n}`));
}

describe('WallList', () => {
  it('renders one row per wall, labelled Wall 1…n, with the length in feet and the room step', () => {
    const { container } = render(<WallList />);
    expect(container.querySelectorAll('.wall-row')).toHaveLength(4);
    const expected = [
      ['Wall 1', '12'],
      ['Wall 2', '14'],
      ['Wall 3', '12'],
      ['Wall 4', '14'],
    ] as const;
    for (const [label, value] of expected) {
      const el = input(label);
      expect(el).toHaveAttribute('type', 'number');
      expect(el).toHaveClass('input');
      expect(el).toHaveAttribute('step', '0.25');
      expect(el.value).toBe(value);
      expect(el.parentElement?.querySelector('.input-suffix')).toHaveTextContent(/^ft$/);
    }
  });

  it('shows the lengths in metres with the metre step when units are m', () => {
    usePlanStore.getState().setUnits('m');
    render(<WallList />);
    expect(input('Wall 1').value).toBe('3.66');
    expect(input('Wall 2').value).toBe('4.27');
    expect(input('Wall 1')).toHaveAttribute('step', '0.05');
    expect(input('Wall 1').parentElement?.querySelector('.input-suffix')).toHaveTextContent(/^m$/);
  });

  it('lists every wall of a room that is not a rectangle, in either mode', () => {
    makeLShape();
    const { container, rerender } = render(<WallList />);
    expect(container.querySelectorAll('.wall-row')).toHaveLength(6);
    expect(input('Wall 2').value).toBe('7');
    act(() => useUiStore.getState().setMode('room'));
    rerender(<WallList />);
    expect(container.querySelectorAll('.wall-row')).toHaveLength(6);
    expect(input('Wall 6').value).toBe('14');
  });

  it('applies a valid typed length through setWallLength and clears the room problem', () => {
    const before = outline();
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    render(<WallList />);
    typeRaw(input('Wall 1'), '10');
    const expected = setWallLength(before, 'c1', 120);
    expect(expected.ok).toBe(true);
    expect(outline()).toEqual(expected.ok ? expected.outline : null);
    expect(outline()[1]).toEqual({ id: 'c2', x: 120, y: 0 });
    expect(useUiStore.getState().roomProblem).toBeNull();
    expect(input('Wall 1').value).toBe('10');
  });

  it('accepts a wall length below the room minimum but at least 6 in', () => {
    render(<WallList />);
    typeRaw(input('Wall 1'), '0.5');
    expect(outline()[1]).toEqual({ id: 'c2', x: 6, y: 0 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('refuses a length that makes walls cross: outline unchanged, typed text kept, reason set', () => {
    makeLShape();
    const before = outline();
    render(<WallList />);
    // Wall 2 runs down from (72, 0) to (72, 84); 200 in pushes it through the bottom wall.
    typeRaw(input('Wall 2'), String(200 / 12));
    expect(outline()).toEqual(before);
    expect(input('Wall 2').value).toBe(String(200 / 12));
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
  });

  it('refuses a length under 6 in as too short', () => {
    const before = outline();
    render(<WallList />);
    typeRaw(input('Wall 1'), '0.25');
    expect(outline()).toEqual(before);
    expect(input('Wall 1').value).toBe('0.25');
    expect(useUiStore.getState().roomProblem).toBe('That wall would be too short.');
  });

  it('refuses a length over 720 in as too large, even on a diagonal wall that would fit', () => {
    // A right triangle whose hypotenuse (wall 2) is 721 in long fits inside 720 × 720 bounds.
    storeOutline([{ id: 't1', x: 0, y: 0 }, { id: 't2', x: 500, y: 0 }, { id: 't3', x: 0, y: 500 }]);
    const before = outline();
    render(<WallList />);
    typeRaw(input('Wall 2'), String(721 / 12));
    expect(outline()).toEqual(before);
    expect(useUiStore.getState().roomProblem).toBe('That would make the room too large.');
  });

  it('accepts a length of exactly 720 in', () => {
    render(<WallList />);
    typeRaw(input('Wall 1'), '60');
    expect(outline()[1]).toEqual({ id: 'c2', x: 720, y: 0 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('leaves the outline and the room problem alone for text that is not a number', () => {
    const before = outline();
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    render(<WallList />);
    typeRaw(input('Wall 1'), '');
    expect(outline()).toEqual(before);
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
    expect(input('Wall 1').value).toBe('');
  });

  it('shows a length changed from elsewhere while the input is not focused', () => {
    render(<WallList />);
    typeRaw(input('Wall 1'), '0.25');
    act(() => {
      usePlanStore.getState().applyOutline(setWallLength(outline(), 'c1', 150));
    });
    expect(input('Wall 1').value).toBe('12.5');
  });

  it('keeps a focused draft that already parses to the new length', () => {
    render(<WallList />);
    const el = input('Wall 1');
    act(() => el.focus());
    // jsdom sanitises "10." on a number input to ""; Chrome reports the typed text.
    Object.defineProperty(el, 'value', { configurable: true, writable: true, value: '10.' });
    fireEvent.change(el);
    expect(outline()[1]).toEqual({ id: 'c2', x: 120, y: 0 });
    expect(el.value).toBe('10.');
  });

  it('replaces a focused draft that does not parse to the new length', () => {
    render(<WallList />);
    const el = input('Wall 1');
    act(() => el.focus());
    typeRaw(el, '0.25');
    act(() => {
      usePlanStore.getState().applyOutline(setWallLength(outline(), 'c1', 150));
    });
    expect(el.value).toBe('12.5');
  });

  it('replaces an unfocused draft that parses to the new length with the formatted length', () => {
    render(<WallList />);
    const el = input('Wall 1');
    typeRaw(el, '10.00');
    expect(outline()[1]).toEqual({ id: 'c2', x: 120, y: 0 });
    expect(el.value).toBe('10');
  });

  it('re-seeds the lengths when units change', () => {
    render(<WallList />);
    act(() => usePlanStore.getState().setUnits('m'));
    expect(input('Wall 1').value).toBe('3.66');
  });

  it('has no add-corner buttons in furnish mode', () => {
    render(<WallList />);
    expect(screen.queryByRole('button', { name: /^Add a corner to wall/ })).toBeNull();
  });

  it('has an Add a corner to wall n button per wall in room mode', () => {
    useUiStore.getState().setMode('room');
    render(<WallList />);
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole('button', { name: `Add a corner to wall ${n}` })).toBeInTheDocument();
    }
  });

  it('adds and selects a corner at the midpoint of the wall when its button is clicked', async () => {
    useUiStore.getState().setMode('room');
    const { container } = render(<WallList />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add a corner to wall 2' }));
    const corners = outline();
    expect(corners).toHaveLength(5);
    expect(corners[2]).toMatchObject({ x: 144, y: 84 });
    expect([0, 1, 3, 4].map((i) => corners[i].id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(['c1', 'c2', 'c3', 'c4']).not.toContain(corners[2].id);
    expect(useUiStore.getState().selectedCornerId).toBe(corners[2].id);
    expect(container.querySelectorAll('.wall-row')).toHaveLength(5);
    expect(input('Wall 2').value).toBe('7');
    expect(input('Wall 3').value).toBe('7');
  });

  it('leaves the outline unchanged and sets the reason when adding a corner is refused', async () => {
    storeOutline([{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 10, y: 0 }, { id: 'n3', x: 10, y: 100 }, { id: 'n4', x: 0, y: 100 }]);
    const before = outline();
    useUiStore.getState().setMode('room');
    render(<WallList />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add a corner to wall 1' }));
    expect(outline()).toEqual(before);
    expect(useUiStore.getState().roomProblem).toBe('That wall would be too short.');
    expect(useUiStore.getState().selectedCornerId).toBeNull();
  });

  describe('while a door or window tool is armed', () => {
    it.each(['door', 'window'] as const)('replaces each Add a corner button with Place the %s on wall n', (tool) => {
      useUiStore.getState().setMode('room');
      useUiStore.getState().setRoomTool(tool);
      render(<WallList />);
      expect(screen.queryByRole('button', { name: /^Add a corner to wall/ })).toBeNull();
      for (const n of [1, 2, 3, 4]) {
        expect(screen.getByRole('button', { name: `Place the ${tool} on wall ${n}` })).toBeInTheDocument();
      }
    });

    it('places a door centred on wall 1 from the keyboard and disarms the tool', async () => {
      useUiStore.getState().setMode('room');
      useUiStore.getState().setRoomTool('door');
      render(<WallList />);
      screen.getByRole('button', { name: 'Place the door on wall 1' }).focus();
      await userEvent.setup().keyboard('{Enter}');
      const openings = usePlanStore.getState().openings;
      expect(openings).toHaveLength(1);
      expect(openings[0]).toMatchObject({ kind: 'door', wallId: 'c1', offset: 56, width: 32 });
      expect(useUiStore.getState().roomTool).toBe('corner');
      expect(useUiStore.getState().selectedOpeningId).toBe(openings[0].id);
      expect(outline()).toHaveLength(4);
      expect(screen.getByRole('button', { name: 'Add a corner to wall 1' })).toBeInTheDocument();
    });

    it('places a window centred on wall 2', async () => {
      useUiStore.getState().setMode('room');
      useUiStore.getState().setRoomTool('window');
      render(<WallList />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Place the window on wall 2' }));
      expect(usePlanStore.getState().openings).toEqual([
        expect.objectContaining({ kind: 'window', wallId: 'c2', offset: 66, width: 36 }),
      ]);
    });

    it('goes back to the add-corner buttons when the tool is cancelled', () => {
      useUiStore.getState().setMode('room');
      useUiStore.getState().setRoomTool('door');
      render(<WallList />);
      act(() => useUiStore.getState().setRoomTool('corner'));
      expect(screen.queryByRole('button', { name: /^Place the/ })).toBeNull();
      expect(screen.getByRole('button', { name: 'Add a corner to wall 1' })).toBeInTheDocument();
    });
  });

  describe('with a door on wall 1', () => {
    /** A 32 in door centred on the top wall c1: it spans x 56–88. */
    const DOOR: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 56, width: 32, height: 80, hinge: 'start', swing: 'in' };

    beforeEach(() => {
      usePlanStore.getState().reset({ ...createInitialDocument(), openings: [DOOR] });
    });

    it('refuses a length that leaves the door without room: outline unchanged, reason set', () => {
      const before = usePlanStore.getState();
      useUiStore.getState().setRoomProblem(null);
      render(<WallList />);
      typeRaw(input('Wall 1'), String(80 / 12));
      expect(usePlanStore.getState()).toBe(before);
      expect(useUiStore.getState().roomProblem).toBe('That would leave a door or window without room on its wall.');
    });

    it('accepts a length the door still fits and clears the reason', () => {
      useUiStore.getState().setRoomProblem('Walls cannot cross.');
      render(<WallList />);
      typeRaw(input('Wall 1'), '8');
      expect(outline()[1]).toEqual({ id: 'c2', x: 96, y: 0 });
      expect(usePlanStore.getState().openings).toEqual([DOOR]);
      expect(useUiStore.getState().roomProblem).toBeNull();
    });

    it('refuses a corner added at the middle of the wall, inside the door, and sets the reason', async () => {
      useUiStore.getState().setMode('room');
      const before = usePlanStore.getState();
      render(<WallList />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Add a corner to wall 1' }));
      expect(usePlanStore.getState()).toBe(before);
      expect(useUiStore.getState().roomProblem).toBe('A corner cannot go inside a door or window.');
    });
  });
});
