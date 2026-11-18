import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Door, Obstacle, Opening, WindowOpening } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { furnishedDocument } from '../../test/fixtures';
import { RoomFeatures } from './RoomFeatures';

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

/** A 32 in door centred on the top wall c1: it spans x 56–88. */
const DOOR: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 56, width: 32, height: 80, hinge: 'start', swing: 'in' };
/** A 36 in window on the right wall c2, 20 in from its top end. */
const WINDOW: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 20, width: 36, sill: 36, height: 48 };
/** A 24 in box in the middle of the furnished room, away from the furniture and the door. */
const BOX: Obstacle = { id: 'b1', shape: 'box', label: 'Box', x: 72, y: 120, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };
const COLUMN: Obstacle = { id: 'k1', shape: 'cylinder', label: 'Column', x: 30, y: 140, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };

/** The furnished plan (bed and desk) with these doors, windows and obstacles, in room mode. */
function seed(openings: Opening[], obstacles: Obstacle[] = []): void {
  usePlanStore.getState().reset({ ...furnishedDocument(), openings, obstacles });
  useUiStore.getState().setMode('room');
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLInputElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

function list(): HTMLElement {
  return screen.getByRole('group', { name: 'Doors, windows and obstacles' });
}

/** The list's row buttons, by accessible name. */
function rowNames(): string[] {
  return within(list()).getAllByRole('button').map((b) => b.textContent ?? '');
}

function opening(id: string): Opening | undefined {
  return usePlanStore.getState().openings.find((o) => o.id === id);
}

function obstacle(id: string): Obstacle | undefined {
  return usePlanStore.getState().obstacles.find((o) => o.id === id);
}

describe('RoomFeatures', () => {
  it('renders nothing in furnish mode', () => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [DOOR], obstacles: [BOX] });
    const { container } = render(<RoomFeatures />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Add door, Add window, Add box and Add column in a group labelled Add to the room', () => {
    seed([]);
    render(<RoomFeatures />);
    const group = screen.getByRole('group', { name: 'Add to the room' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Add door',
      'Add window',
      'Add box',
      'Add column',
    ]);
    for (const b of within(group).getAllByRole('button')) expect(b).not.toHaveAttribute('aria-pressed');
  });

  it('arms the door tool, reads Cancel door with the help text, and cancels it again', async () => {
    seed([]);
    render(<RoomFeatures />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add door' }));
    expect(useUiStore.getState().roomTool).toBe('door');
    const cancel = screen.getByRole('button', { name: 'Cancel door' });
    expect(cancel).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('status')).toHaveTextContent(/^Click a wall to place the door\.$/);
    await user.click(cancel);
    expect(useUiStore.getState().roomTool).toBe('corner');
    expect(screen.getByRole('button', { name: 'Add door' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('arms the window tool, and arming the door tool instead disarms it', async () => {
    seed([]);
    render(<RoomFeatures />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add window' }));
    expect(useUiStore.getState().roomTool).toBe('window');
    expect(screen.getByRole('button', { name: 'Cancel window' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('status')).toHaveTextContent(/^Click a wall to place the window\.$/);
    await user.click(screen.getByRole('button', { name: 'Add door' }));
    expect(useUiStore.getState().roomTool).toBe('door');
    expect(screen.getByRole('button', { name: 'Add window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel door' })).toBeInTheDocument();
  });

  it.each([
    ['Add box', 'box', 'Box', 24],
    ['Add column', 'cylinder', 'Column', 12],
  ] as const)('%s adds one obstacle at the room interior point, selected, with its fields shown', async (name, shape, label, width) => {
    seed([]);
    render(<RoomFeatures />);
    await userEvent.setup().click(screen.getByRole('button', { name }));
    const obstacles = usePlanStore.getState().obstacles;
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]).toMatchObject({ shape, label, x: 72, y: 84, width });
    expect(useUiStore.getState().selectedObstacleId).toBe(obstacles[0].id);
    expect(input('Label').value).toBe(label);
    expect(input('Width').value).toBe(String(width));
  });

  it('shows None yet. in the list while the room has no door, window or obstacle', () => {
    seed([]);
    render(<RoomFeatures />);
    expect(within(list()).getByText('None yet.')).toBeInTheDocument();
    expect(within(list()).queryAllByRole('button')).toHaveLength(0);
  });

  it('lists openings first, then obstacles, each in stored order, and is not a heading', () => {
    seed([WINDOW, DOOR], [COLUMN, BOX, { ...BOX, id: 'b2', label: '' }, { ...COLUMN, id: 'k2', label: '' }]);
    render(<RoomFeatures />);
    expect(rowNames()).toEqual(['Window on wall 2', 'Door on wall 1', 'Column (1 of 2)', 'Box (1 of 2)', 'Box (2 of 2)', 'Column (2 of 2)']);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('None yet.')).toBeNull();
  });

  it('numbers obstacles that share a name, (k of n) in list order, after Add box twice', async () => {
    seed([]);
    render(<RoomFeatures />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    expect(rowNames()).toEqual(['Box']);
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add column' }));
    expect(rowNames()).toEqual(['Box (1 of 2)', 'Box (2 of 2)', 'Column']);
    expect(screen.getByRole('button', { name: 'Box (2 of 2)' })).toBeInTheDocument();
  });

  it('names two doors on one wall as the plan handles do: (1 of 2) and (2 of 2) by offset', () => {
    seed([DOOR, { ...DOOR, id: 'd0', offset: 0 }]);
    render(<RoomFeatures />);
    expect(rowNames()).toEqual(['Door on wall 1 (2 of 2)', 'Door on wall 1 (1 of 2)']);
    act(() => useUiStore.getState().selectOpening('d0'));
    expect(screen.getByRole('group', { name: 'Door on wall 1 (1 of 2)' })).toBeInTheDocument();
  });

  it('selects a door, window or obstacle when its row is clicked, marking that row pressed', async () => {
    seed([DOOR, WINDOW], [BOX]);
    render(<RoomFeatures />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Window on wall 2' }));
    expect(useUiStore.getState().selectedOpeningId).toBe('w1');
    expect(screen.getByRole('button', { name: 'Window on wall 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Door on wall 1' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Box' }));
    expect(useUiStore.getState().selectedObstacleId).toBe('b1');
    expect(useUiStore.getState().selectedOpeningId).toBeNull();
    expect(screen.getByRole('button', { name: 'Box' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an obstacle or opening conflict as a tag in its row', () => {
    // A 120 in box and a 100 in door are both taller than the 96 in ceiling.
    seed([{ ...DOOR, height: 100 }], [{ ...BOX, height: 120 }]);
    render(<RoomFeatures />);
    const doorTag = within(screen.getByRole('button', { name: /^Door on wall 1/ })).getByText('Taller than the ceiling');
    expect(doorTag.tagName).toBe('SPAN');
    expect(doorTag).toHaveClass('tag');
    const boxTag = within(screen.getByRole('button', { name: /^Box/ })).getByText('Taller than the ceiling');
    expect(boxTag.tagName).toBe('SPAN');
    expect(boxTag).toHaveClass('tag');
  });

  it('shows no tag in a row whose thing has no conflict', () => {
    seed([DOOR], [BOX]);
    const { container } = render(<RoomFeatures />);
    expect(container.querySelector('.tag')).toBeNull();
  });

  it('shows no fields while nothing is selected', () => {
    seed([DOOR], [BOX]);
    render(<RoomFeatures />);
    expect(screen.queryByLabelText('Width')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  describe('a selected door', () => {
    beforeEach(() => {
      seed([DOOR]);
      useUiStore.getState().selectOpening('d1');
    });

    it('shows Width and Height in inches, Hinge and Swing choices and a Remove button, in a group named for the door', () => {
      render(<RoomFeatures />);
      const fields = screen.getByRole('group', { name: 'Door on wall 1' });
      expect((within(fields).getByLabelText('Width') as HTMLInputElement).value).toBe('32');
      expect((within(fields).getByLabelText('Height') as HTMLInputElement).value).toBe('80');
      expect(within(fields).getAllByText('in').length).toBeGreaterThanOrEqual(2);
      const hinge = within(fields).getByRole('radiogroup', { name: 'Hinge' });
      expect(within(hinge).getByRole('radio', { name: 'Start of wall' })).toBeChecked();
      expect(within(hinge).getByRole('radio', { name: 'End of wall' })).not.toBeChecked();
      const swing = within(fields).getByRole('radiogroup', { name: 'Swing' });
      expect(within(swing).getByRole('radio', { name: 'Into the room' })).toBeChecked();
      expect(within(swing).getByRole('radio', { name: 'Out of the room' })).not.toBeChecked();
      expect(within(fields).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Sill')).toBeNull();
      expect(screen.queryByLabelText('Label')).toBeNull();
    });

    it('stores a typed width of 36, End of wall and Out of the room', async () => {
      render(<RoomFeatures />);
      typeRaw(input('Width'), '36');
      expect(opening('d1')).toMatchObject({ width: 36 });
      const user = userEvent.setup();
      await user.click(screen.getByRole('radio', { name: 'End of wall' }));
      expect(opening('d1')).toMatchObject({ width: 36, hinge: 'end' });
      await user.click(screen.getByRole('radio', { name: 'Out of the room' }));
      expect(opening('d1')).toEqual({ ...DOOR, width: 36, hinge: 'end', swing: 'out' });
      expect(screen.getByRole('radio', { name: 'Out of the room' })).toBeChecked();
    });

    it('stores a typed height', () => {
      render(<RoomFeatures />);
      typeRaw(input('Height'), '84');
      expect(opening('d1')).toMatchObject({ height: 84 });
    });

    it('refuses a width under the minimum: door unchanged, typed text kept, reason set', () => {
      render(<RoomFeatures />);
      typeRaw(input('Width'), '8');
      expect(opening('d1')).toEqual(DOOR);
      expect(input('Width').value).toBe('8');
      expect(useUiStore.getState().roomProblem).toBe('That size is not allowed.');
      typeRaw(input('Width'), '30');
      expect(opening('d1')).toMatchObject({ width: 30 });
      expect(useUiStore.getState().roomProblem).toBeNull();
    });

    it('refuses a width over the maximum with its reason too', () => {
      render(<RoomFeatures />);
      typeRaw(input('Width'), '300');
      expect(opening('d1')).toEqual(DOOR);
      expect(input('Width').value).toBe('300');
      expect(useUiStore.getState().roomProblem).toBe('That size is not allowed.');
    });

    it('leaves the door and the room problem alone for text that is not a number', () => {
      useUiStore.getState().setRoomProblem('Walls cannot cross.');
      render(<RoomFeatures />);
      typeRaw(input('Width'), '');
      expect(opening('d1')).toEqual(DOOR);
      expect(input('Width').value).toBe('');
      expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
    });

    it('shows the next door\'s stored width, not the text typed for the last one, when the selection moves', async () => {
      // The same stored width, so only a fresh field (not a changed stored value) can show it.
      seed([DOOR, { ...DOOR, id: 'd2', wallId: 'c3', height: 84 }]);
      useUiStore.getState().selectOpening('d1');
      render(<RoomFeatures />);
      typeRaw(input('Width'), '8');
      expect(input('Width').value).toBe('8');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Door on wall 3' }));
      expect(useUiStore.getState().selectedOpeningId).toBe('d2');
      expect(input('Height').value).toBe('84');
      expect(input('Width').value).toBe('32');
    });

    it('re-seeds the width when the stored width changes from elsewhere', () => {
      render(<RoomFeatures />);
      typeRaw(input('Width'), '8');
      act(() => usePlanStore.getState().applyOpenings({ ok: true, openings: [{ ...DOOR, width: 40 }] }));
      expect(input('Width').value).toBe('40');
    });

    it('removes the door with Remove, and its fields go', async () => {
      render(<RoomFeatures />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }));
      expect(usePlanStore.getState().openings).toEqual([]);
      expect(useUiStore.getState().selectedOpeningId).toBeNull();
      expect(screen.queryByLabelText('Width')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    });

    it('shows and parses centimetres when units are m', () => {
      usePlanStore.getState().setUnits('m');
      render(<RoomFeatures />);
      expect(input('Width').value).toBe('81');
      expect(input('Height').value).toBe('203');
      expect(screen.getAllByText('cm').length).toBeGreaterThanOrEqual(2);
      typeRaw(input('Width'), '100');
      expect(opening('d1')?.width).toBe(39.37);
      expect(input('Width').value).toBe('100');
    });

    it('re-seeds the fields when units change', () => {
      render(<RoomFeatures />);
      act(() => usePlanStore.getState().setUnits('m'));
      expect(input('Width').value).toBe('81');
    });
  });

  describe('a selected window', () => {
    beforeEach(() => {
      seed([WINDOW]);
      useUiStore.getState().selectOpening('w1');
    });

    it('shows Width, Sill and Height, no Hinge or Swing, and a Remove button', () => {
      render(<RoomFeatures />);
      const fields = screen.getByRole('group', { name: 'Window on wall 2' });
      expect((within(fields).getByLabelText('Width') as HTMLInputElement).value).toBe('36');
      expect((within(fields).getByLabelText('Sill') as HTMLInputElement).value).toBe('36');
      expect((within(fields).getByLabelText('Height') as HTMLInputElement).value).toBe('48');
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(within(fields).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('stores a typed sill of 24', () => {
      render(<RoomFeatures />);
      typeRaw(input('Sill'), '24');
      expect(opening('w1')).toEqual({ ...WINDOW, sill: 24 });
    });

    it('accepts a sill of 0', () => {
      render(<RoomFeatures />);
      typeRaw(input('Sill'), '0');
      expect(opening('w1')).toMatchObject({ sill: 0 });
      expect(useUiStore.getState().roomProblem).toBeNull();
    });
  });

  describe('a selected box', () => {
    beforeEach(() => {
      seed([], [BOX]);
      useUiStore.getState().selectObstacle('b1');
    });

    it('shows Label, Width, Depth, Height, Off the floor and Angle, and a Remove button', () => {
      render(<RoomFeatures />);
      const fields = screen.getByRole('group', { name: 'Box' });
      const label = within(fields).getByLabelText('Label') as HTMLInputElement;
      expect(label.type).toBe('text');
      expect(label.maxLength).toBe(40);
      expect(label.value).toBe('Box');
      expect((within(fields).getByLabelText('Width') as HTMLInputElement).value).toBe('24');
      expect((within(fields).getByLabelText('Depth') as HTMLInputElement).value).toBe('24');
      expect((within(fields).getByLabelText('Height') as HTMLInputElement).value).toBe('36');
      expect((within(fields).getByLabelText('Off the floor') as HTMLInputElement).value).toBe('0');
      expect((within(fields).getByLabelText('Angle') as HTMLInputElement).value).toBe('0');
      expect(within(fields).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('stores a typed label, width, depth, height, Off the floor 40 and angle 30', async () => {
      render(<RoomFeatures />);
      const user = userEvent.setup();
      await user.clear(input('Label'));
      await user.type(input('Label'), 'Radiator');
      typeRaw(input('Width'), '30');
      typeRaw(input('Depth'), '8');
      typeRaw(input('Height'), '300');
      typeRaw(input('Off the floor'), '40');
      typeRaw(input('Angle'), '30');
      expect(obstacle('b1')).toEqual({ ...BOX, label: 'Radiator', width: 30, depth: 8, height: 300, elevation: 40, rotation: 30 });
      expect(input('Label').value).toBe('Radiator');
    });

    it('stores an empty label, and the row then reads Box', async () => {
      render(<RoomFeatures />);
      await userEvent.setup().clear(input('Label'));
      expect(obstacle('b1')?.label).toBe('');
      expect(rowNames()).toEqual(['Box']);
    });

    it('stores a label as typed, cut to 40 characters, and renders markup as text', async () => {
      render(<RoomFeatures />);
      const user = userEvent.setup();
      await user.clear(input('Label'));
      await user.type(input('Label'), '<b>x</b>'.padEnd(45, 'y'));
      const stored = obstacle('b1')?.label;
      expect(stored).toBe('<b>x</b>'.padEnd(40, 'y'));
      expect(rowNames()).toEqual([stored]);
      expect(list().querySelector('b')).toBeNull();
    });

    it('accepts Off the floor 0 and refuses a height of 0 with its reason', () => {
      usePlanStore.getState().applyObstacles({ ok: true, obstacles: [{ ...BOX, elevation: 10 }] });
      render(<RoomFeatures />);
      typeRaw(input('Off the floor'), '0');
      expect(obstacle('b1')?.elevation).toBe(0);
      typeRaw(input('Height'), '0');
      expect(obstacle('b1')?.height).toBe(36);
      expect(input('Height').value).toBe('0');
      expect(useUiStore.getState().roomProblem).toBe('That size is not allowed.');
    });

    it('accepts an angle in [0, 360) and ignores 360 and text that is not a number', () => {
      render(<RoomFeatures />);
      typeRaw(input('Angle'), '359.5');
      expect(obstacle('b1')?.rotation).toBe(359.5);
      typeRaw(input('Angle'), '360');
      expect(obstacle('b1')?.rotation).toBe(359.5);
      expect(input('Angle').value).toBe('360');
      typeRaw(input('Angle'), '');
      expect(obstacle('b1')?.rotation).toBe(359.5);
    });

    it('removes the box with Remove, and its fields go', async () => {
      render(<RoomFeatures />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }));
      expect(usePlanStore.getState().obstacles).toEqual([]);
      expect(useUiStore.getState().selectedObstacleId).toBeNull();
      expect(screen.queryByLabelText('Label')).toBeNull();
    });

    it('shows and parses centimetres when units are m', () => {
      usePlanStore.getState().setUnits('m');
      render(<RoomFeatures />);
      expect(input('Width').value).toBe('61');
      typeRaw(input('Off the floor'), '100');
      expect(obstacle('b1')?.elevation).toBe(39.37);
    });
  });

  describe('a selected column', () => {
    beforeEach(() => {
      seed([], [COLUMN]);
      useUiStore.getState().selectObstacle('k1');
    });

    it('has no Depth and no Angle field', () => {
      render(<RoomFeatures />);
      expect(screen.getByRole('group', { name: 'Column' })).toBeInTheDocument();
      expect(input('Width').value).toBe('12');
      expect(input('Height').value).toBe('96');
      expect(input('Off the floor').value).toBe('0');
      expect(screen.queryByLabelText('Depth')).toBeNull();
      expect(screen.queryByLabelText('Angle')).toBeNull();
    });

    it('sets the width and the depth from a typed width', () => {
      render(<RoomFeatures />);
      typeRaw(input('Width'), '20');
      expect(obstacle('k1')).toMatchObject({ width: 20, depth: 20 });
    });
  });
});
