import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { wallFrame, wallsOf } from '../../domain/outline';
import { fmtLen } from '../../domain/units';
import { setWallLengthTo } from '../../state/actions';
import { ROOM_PROBLEM_TEXT, usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { planDoc, rectRoom } from '../../test/fixtures';
import { type PlanLayout, toPane } from '../../view/planLayout';
import { WallLengthLabels } from './WallLengthLabels';

// The actions run for real; the spy records whether the editor applied a length.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return { ...actual, setWallLengthTo: vi.fn(actual.setWallLengthTo) };
});

/** R: c1 (0,0), c2 (144,0), c3 (144,168), c4 (0,168). */
const R = rectRoom(144, 168, 96);
const LAYOUT: PlanLayout = { scale: 2, ox: 10, oy: 20 };

beforeEach(() => {
  usePlanStore.getState().reset(planDoc(R, [], 'ft'));
  useUiStore.getState().reset();
  useUiStore.getState().setMode('room');
  vi.mocked(setWallLengthTo).mockClear();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});

function labels(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button.room-wall-label')];
}

function label(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`button.room-wall-label[data-wall-label-id="${id}"]`);
  if (!el) throw new Error(`no label for wall ${id}`);
  return el;
}

describe('WallLengthLabels', () => {
  it('draws one button per wall showing its length, named Wall <n>, <length>', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    const walls = wallsOf(R.outline);
    expect(labels()).toHaveLength(4);
    walls.forEach((w, i) => {
      const text = fmtLen(w.length, 'ft');
      const el = labels()[i];
      expect(el).toHaveAttribute('data-wall-label-id', w.id);
      expect(el).toHaveTextContent(text);
      expect(screen.getByRole('button', { name: `Wall ${i + 1}, ${text}` })).toBe(el);
    });
  });

  it('centres each label on the wall midpoint in pane px, moved wallLabelOffsetPx + wallLabelHalfHeightPx outside the room', () => {
    expect(CONFIG.wallLabelOffsetPx).toBe(10);
    expect(CONFIG.wallLabelHalfHeightPx).toBe(9);
    const out = CONFIG.wallLabelOffsetPx + CONFIG.wallLabelHalfHeightPx;
    render(<WallLengthLabels layout={LAYOUT} />);
    for (const w of wallsOf(R.outline)) {
      const { n } = wallFrame(w);
      const mid = toPane({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, LAYOUT);
      const el = label(w.id);
      expect(parseFloat(el.style.left)).toBeCloseTo(mid.x - out * n.x, 6);
      expect(parseFloat(el.style.top)).toBeCloseTo(mid.y - out * n.y, 6);
    }
    // The top wall's label sits above it: midpoint (72, 0) is pane (154, 20), so 19 px up.
    expect(parseFloat(label('c1').style.left)).toBeCloseTo(154, 6);
    expect(parseFloat(label('c1').style.top)).toBeCloseTo(1, 6);
    // The right wall's: midpoint (144, 84) is pane (298, 188), so 19 px right.
    expect(parseFloat(label('c2').style.left)).toBeCloseTo(317, 6);
    expect(parseFloat(label('c2').style.top)).toBeCloseTo(188, 6);
  });

  it('puts a diagonal wall\'s label 19 px outside it, along (0.8, −0.6) from the midpoint, turned to the wall', () => {
    // Wall a1 runs (0,0) → (30,40): u = (0.6, 0.8), inward normal n = (−0.8, 0.6).
    act(() => {
      usePlanStore.getState().applyOutline({
        ok: true,
        outline: [
          { id: 'a1', x: 0, y: 0 },
          { id: 'a2', x: 30, y: 40 },
          { id: 'a3', x: -30, y: 60 },
        ],
      });
    });
    render(<WallLengthLabels layout={LAYOUT} />);
    const wall = wallsOf(usePlanStore.getState().room.outline).find((w) => w.id === 'a1');
    if (!wall) throw new Error('no wall a1');
    const { n } = wallFrame(wall);
    expect(n.x).toBeCloseTo(-0.8, 9);
    expect(n.y).toBeCloseTo(0.6, 9);
    // Midpoint (15, 20) is pane (40, 60); 19 px along (0.8, −0.6) is (55.2, 48.6).
    expect(parseFloat(label('a1').style.left)).toBeCloseTo(55.2, 6);
    expect(parseFloat(label('a1').style.top)).toBeCloseTo(48.6, 6);
    // atan2(0.8, 0.6) = 53.13°.
    expect(label('a1').style.transform).toBe('translate(-50%, -50%) rotate(53.13deg)');
  });

  it('turns a label on the same diagonal run the other way to the same upright angle', () => {
    // Wall a1 runs (30,40) → (0,0): u = (−0.6, −0.8), inward normal n = (0.8, −0.6).
    act(() => {
      usePlanStore.getState().applyOutline({
        ok: true,
        outline: [
          { id: 'a1', x: 30, y: 40 },
          { id: 'a2', x: 0, y: 0 },
          { id: 'a3', x: 60, y: -20 },
        ],
      });
    });
    render(<WallLengthLabels layout={LAYOUT} />);
    const wall = wallsOf(usePlanStore.getState().room.outline).find((w) => w.id === 'a1');
    if (!wall) throw new Error('no wall a1');
    const { n } = wallFrame(wall);
    expect(n.x).toBeCloseTo(0.8, 9);
    expect(n.y).toBeCloseTo(-0.6, 9);
    // Midpoint (15, 20) is pane (40, 60); 19 px along (−0.8, 0.6) is (24.8, 71.4).
    expect(parseFloat(label('a1').style.left)).toBeCloseTo(24.8, 6);
    expect(parseFloat(label('a1').style.top)).toBeCloseTo(71.4, 6);
    // atan2(−0.8, −0.6) = −126.87°, brought upright by adding 180.
    expect(label('a1').style.transform).toBe('translate(-50%, -50%) rotate(53.13deg)');
  });

  it('turns each label of R to run along its wall, kept upright (vertical walls read bottom to top)', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(label('c1').style.transform).toBe('translate(-50%, -50%) rotate(0deg)');
    expect(label('c2').style.transform).toBe('translate(-50%, -50%) rotate(-90deg)');
    expect(label('c3').style.transform).toBe('translate(-50%, -50%) rotate(0deg)');
    expect(label('c4').style.transform).toBe('translate(-50%, -50%) rotate(-90deg)');
  });

  it('keeps the open editor unturned, wallLabelOffsetPx outside the wall\'s midpoint', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    fireEvent.click(label('c2'));
    const editor = document.querySelector<HTMLElement>('div.room-wall-editor');
    if (!editor) throw new Error('no editor');
    expect(editor.style.transform).toBe('');
    // The right wall's midpoint is pane (298, 188); 10 px right of it.
    expect(parseFloat(editor.style.left)).toBeCloseTo(308, 6);
    expect(parseFloat(editor.style.top)).toBeCloseTo(188, 6);
  });

  it('follows the units when they change to m', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    act(() => usePlanStore.getState().setUnits('m'));
    wallsOf(R.outline).forEach((w, i) => {
      const text = fmtLen(w.length, 'm');
      expect(label(w.id)).toHaveTextContent(text);
      expect(label(w.id)).toHaveAccessibleName(`Wall ${i + 1}, ${text}`);
    });
  });

  it('marks the selected wall\'s label aria-pressed', () => {
    useUiStore.getState().selectWall('c2');
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(label('c2')).toHaveAttribute('aria-pressed', 'true');
    for (const id of ['c1', 'c3', 'c4']) expect(label(id)).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects its wall when a label receives focus', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    act(() => label('c3').focus());
    expect(useUiStore.getState().selectedWallId).toBe('c3');
  });

  it('a click on a label selects its wall', async () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    await userEvent.setup().click(label('c4'));
    expect(useUiStore.getState().selectedWallId).toBe('c4');
  });

  it('a pointer down on a label does not reach the plan background', () => {
    const onParent = vi.fn();
    render(
      <div onPointerDown={onParent}>
        <WallLengthLabels layout={LAYOUT} />
      </div>,
    );
    fireEvent.pointerDown(label('c1'), { button: 0 });
    expect(onParent).not.toHaveBeenCalled();
  });

  it('every label carries a title saying what a click and the arrow keys do', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(labels()).toHaveLength(4);
    for (const el of labels()) expect(el).toHaveAttribute('title', 'Click to type a length. Arrow keys move the wall.');
  });
});

describe('WallLengthLabels: moving-end marks', () => {
  function marks(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('span.room-wall-moving-end')];
  }

  /** The pane px of each mark, as [left, top]. */
  function markPoints(): number[][] {
    return marks().map((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  }

  // R's c1 (0,0) is pane (10, 20) and c2 (144,0) is pane (298, 20) at scale 2.
  it.each([
    ['end', [[298, 20]]],
    ['start', [[10, 20]]],
    ['both', [[10, 20], [298, 20]]],
  ] as const)('anchor %s on wall c1 marks the corner(s) a typed length moves', (anchor, expected) => {
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().setLengthAnchor(anchor);
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(marks()).toHaveLength(expected.length);
    for (const el of marks()) expect(el).toHaveAttribute('aria-hidden', 'true');
    markPoints().forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i]?.[0] ?? NaN, 6);
      expect(y).toBeCloseTo(expected[i]?.[1] ?? NaN, 6);
    });
  });

  it('marks the last wall\'s end at the first corner (anchor end on c4)', () => {
    useUiStore.getState().selectWall('c4');
    useUiStore.getState().setLengthAnchor('end');
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(markPoints()).toEqual([[10, 20]]);
  });

  it('follows the anchor and the selection as they change', () => {
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().setLengthAnchor('end');
    render(<WallLengthLabels layout={LAYOUT} />);
    act(() => useUiStore.getState().setLengthAnchor('both'));
    expect(marks()).toHaveLength(2);
    act(() => useUiStore.getState().selectWall(null));
    expect(marks()).toHaveLength(0);
  });

  it('draws no mark with no wall selected', () => {
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(marks()).toHaveLength(0);
  });

  it('draws no mark for an unknown wall id', () => {
    useUiStore.getState().selectWall('nope');
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(marks()).toHaveLength(0);
  });
});

/** The open editor (there is at most one), or null. */
function editorEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('div.room-wall-editor');
}

/** The open editor's number input. */
function lengthInput(): HTMLInputElement {
  const el = editorEl()?.querySelector<HTMLInputElement>('input');
  if (!el) throw new Error('no editor input');
  return el;
}

/** The outline's corners as plain data, for comparing before and after. */
function corners() {
  return usePlanStore.getState().room.outline.map((c) => ({ ...c }));
}

/** The current length of wall `id` in inches. */
function lengthOf(id: string): number {
  const w = wallsOf(usePlanStore.getState().room.outline).find((x) => x.id === id);
  if (!w) throw new Error(`no wall ${id}`);
  return w.length;
}

/** Renders the labels plus a button outside them (somewhere for focus to go) and opens wall `id`'s editor. */
async function openOn(id: string) {
  const user = userEvent.setup();
  render(
    <>
      <WallLengthLabels layout={LAYOUT} />
      <button type="button">Outside</button>
    </>,
  );
  await user.click(label(id));
  return user;
}

describe('WallLengthLabels: on-plan length editor', () => {
  it('a click on a label replaces it with the editor group, its input focused and its text selected', async () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    try {
      await openOn('c1');
      expect(document.querySelector('button.room-wall-label[data-wall-label-id="c1"]')).toBeNull();
      const group = screen.getByRole('group', { name: 'Wall 1 length' });
      expect(group).toBe(editorEl());
      const input = within(group).getByRole('spinbutton', { name: 'Wall 1 length' });
      expect(input).toBe(lengthInput());
      expect(input).toHaveValue(12);
      expect(input).toHaveAttribute('step', '0.25');
      expect(input).toHaveFocus();
      expect(select).toHaveBeenCalled();
      expect(select.mock.contexts.at(-1)).toBe(input);
      expect(group.querySelector('.input-suffix')).toHaveTextContent('ft');
      expect(within(group).getByRole('radiogroup', { name: 'Which end moves' })).toBeInTheDocument();
      // The editor sits beside its wall, in the label's place.
      expect(group.style.left).not.toBe('');
      expect(group.style.top).not.toBe('');
    } finally {
      select.mockRestore();
    }
  });

  it('a click on an unfocused label selects its wall and opens the editor (browsers that do not focus a clicked button)', () => {
    useUiStore.getState().selectCorner('c1');
    render(<WallLengthLabels layout={LAYOUT} />);
    expect(label('c3')).not.toHaveFocus();
    fireEvent.click(label('c3'));
    expect(useUiStore.getState().selectedWallId).toBe('c3');
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(screen.getByRole('group', { name: 'Wall 3 length' })).toBe(editorEl());
  });

  it('Enter on a focused label opens the editor', async () => {
    const user = userEvent.setup();
    render(<WallLengthLabels layout={LAYOUT} />);
    act(() => label('c2').focus());
    await user.keyboard('{Enter}');
    expect(screen.getByRole('spinbutton', { name: 'Wall 2 length' })).toHaveFocus();
  });

  it('shows the length in the room units: metres when the units are m', async () => {
    act(() => usePlanStore.getState().setUnits('m'));
    await openOn('c2');
    const input = lengthInput();
    expect(input).toHaveValue(4.27);
    expect(input).toHaveAttribute('step', '0.05');
    expect(editorEl()?.querySelector('.input-suffix')).toHaveTextContent('m');
  });

  it('typing replaces the selected text', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    expect(lengthInput()).toHaveValue(13);
  });

  it('has three radios in the order start, both, end, named after the wall\'s corners', async () => {
    await openOn('c1');
    const radios = within(screen.getByRole('radiogroup', { name: 'Which end moves' })).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Corner 1 end', 'Both ends', 'Corner 2 end']);
    radios.forEach((r) => expect(r.tagName).toBe('BUTTON'));
  });

  it('the last wall\'s end corner wraps round to Corner 1', async () => {
    await openOn('c4');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Corner 4 end', 'Both ends', 'Corner 1 end']);
  });

  it('aria-checked follows lengthAnchor', async () => {
    await openOn('c1');
    expect(useUiStore.getState().lengthAnchor).toBe('end');
    expect(screen.getByRole('radio', { name: 'Corner 2 end' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Corner 1 end' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Both ends' })).toHaveAttribute('aria-checked', 'false');
    act(() => useUiStore.getState().setLengthAnchor('start'));
    expect(screen.getByRole('radio', { name: 'Corner 1 end' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Corner 2 end' })).toHaveAttribute('aria-checked', 'false');
  });

  it('choosing a radio sets lengthAnchor and keeps the editor open with its draft', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.click(screen.getByRole('radio', { name: 'Both ends' }));
    expect(useUiStore.getState().lengthAnchor).toBe('both');
    expect(screen.getByRole('radio', { name: 'Both ends' })).toHaveAttribute('aria-checked', 'true');
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveValue(13);
    expect(corners()).toEqual(R.outline);
    expect(setWallLengthTo).not.toHaveBeenCalled();
  });

  it.each([
    ['c1', 0],
    ['c2', 90],
    ['c3', 180],
    ['c4', -90],
  ])('wall %s: the radios show ←, ↔, → turned to the wall angle (%s deg)', async (id, deg) => {
    await openOn(id);
    const wall = wallsOf(R.outline).find((w) => w.id === id);
    if (!wall) throw new Error('no wall');
    const { u } = wallFrame(wall);
    const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(deg, 9);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['←', '↔', '→']);
    for (const r of radios) {
      const span = r.querySelector('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe(r.textContent);
      expect(span?.style.transform).toBe(`rotate(${angle}deg)`);
    }
  });

  it('Enter applies a valid length; the editor closes and focus returns to the label', async () => {
    const user = await openOn('c1');
    await user.keyboard('13{Enter}');
    expect(setWallLengthTo).toHaveBeenCalledWith('c1', 156);
    expect(lengthOf('c1')).toBeCloseTo(156, 6);
    expect(editorEl()).toBeNull();
    expect(label('c1')).toHaveFocus();
    expect(useUiStore.getState().selectedWallId).toBe('c1');
  });

  it('Enter applies with the chosen end: start moves Corner 1', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.click(screen.getByRole('radio', { name: 'Corner 1 end' }));
    await user.click(lengthInput());
    await user.keyboard('{Enter}');
    const c1 = usePlanStore.getState().room.outline.find((c) => c.id === 'c1');
    expect(c1?.x).toBeCloseTo(-12, 6);
    expect(lengthOf('c1')).toBeCloseTo(156, 6);
  });

  it('typing without Enter does not change the outline', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.keyboard('5');
    expect(lengthInput()).toHaveValue(135);
    expect(corners()).toEqual(R.outline);
    expect(setWallLengthTo).not.toHaveBeenCalled();
  });

  it('focus leaving the editor applies the length without moving focus back', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(setWallLengthTo).toHaveBeenCalledWith('c1', 156);
    expect(lengthOf('c1')).toBeCloseTo(156, 6);
    expect(editorEl()).toBeNull();
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
  });

  it('focus leaving with a refused length closes the editor, changes nothing and shows the reason', async () => {
    const user = await openOn('c1');
    await user.keyboard('0.1');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(setWallLengthTo).toHaveBeenCalledTimes(1);
    expect(corners()).toEqual(R.outline);
    expect(editorEl()).toBeNull();
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['short-wall']);
  });

  it('Tab from the input to a which-end radio applies nothing and keeps the editor open', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Corner 2 end' })).toHaveFocus();
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(corners()).toEqual(R.outline);
    expect(lengthInput()).toHaveValue(13);
  });

  it('focus moved from the input to a radio applies nothing', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    act(() => screen.getByRole('radio', { name: 'Corner 1 end' }).focus());
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveValue(13);
  });

  it('a pointer press on a radio applies nothing and keeps the editor open', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('radio', { name: 'Both ends' }) });
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).not.toBeNull();
    await user.pointer({ keys: '[/MouseLeft]', target: screen.getByRole('radio', { name: 'Both ends' }) });
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(useUiStore.getState().lengthAnchor).toBe('both');
    expect(lengthInput()).toHaveValue(13);
    expect(corners()).toEqual(R.outline);
  });

  it('a mouse press then a click on a radio still chooses it, though the group prevents the press\'s default', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    const start = screen.getByRole('radio', { name: 'Corner 1 end' });
    expect(fireEvent.mouseDown(start)).toBe(false);
    await user.click(start);
    expect(useUiStore.getState().lengthAnchor).toBe('start');
    expect(start).toHaveAttribute('aria-checked', 'true');
    expect(lengthInput()).toHaveFocus();
    expect(lengthInput()).toHaveValue(13);
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(corners()).toEqual(R.outline);
  });

  it('leaving from a radio to outside the group applies the draft', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(setWallLengthTo).toHaveBeenCalledWith('c1', 156);
    expect(editorEl()).toBeNull();
  });

  it('Enter with a refused length keeps the editor open with the typed text and shows the reason', async () => {
    const user = await openOn('c1');
    await user.keyboard('0.1{Enter}');
    expect(setWallLengthTo).toHaveBeenCalledWith('c1', expect.closeTo(1.2, 9));
    expect(corners()).toEqual(R.outline);
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveValue(0.1);
    expect(lengthInput()).toHaveFocus();
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['short-wall']);
  });

  it.each(['12', '12.0008'])('Enter with the stored length (%s ft) closes without applying', async (text) => {
    const user = await openOn('c1');
    expect(editorEl()).not.toBeNull();
    await user.keyboard(`${text}{Enter}`);
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).toBeNull();
    expect(label('c1')).toHaveFocus();
  });

  it('Enter with an empty input keeps the editor open and applies nothing', async () => {
    const user = await openOn('c1');
    await user.keyboard('{Backspace}');
    expect(lengthInput()).toHaveValue(null);
    await user.keyboard('{Enter}');
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveFocus();
    expect(corners()).toEqual(R.outline);
  });

  it('Enter with text that does not parse ("abc") keeps the editor open and applies nothing', async () => {
    const user = await openOn('c1');
    // user-event refuses letters in a number input; a browser that accepts them reads the value as ''.
    fireEvent.change(lengthInput(), { target: { value: 'abc' } });
    expect(lengthInput()).toHaveValue(null);
    await user.keyboard('{Enter}');
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveFocus();
    expect(corners()).toEqual(R.outline);
  });

  it('a mouse press on the editor\'s own background keeps focus in the input and applies nothing', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    const group = editorEl();
    if (!group) throw new Error('no editor');
    expect(fireEvent.mouseDown(group)).toBe(false);
    await user.pointer({ keys: '[MouseLeft]', target: group });
    const ends = screen.getByRole('radiogroup', { name: 'Which end moves' });
    expect(fireEvent.mouseDown(ends)).toBe(false);
    await user.pointer({ keys: '[MouseLeft]', target: ends });
    expect(lengthInput()).toHaveFocus();
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).not.toBeNull();
    expect(lengthInput()).toHaveValue(13);
  });

  it('a mouse press on the input itself keeps its default', async () => {
    await openOn('c1');
    expect(fireEvent.mouseDown(lengthInput())).toBe(true);
  });

  it('focus leaving with text that does not parse closes without applying', async () => {
    const user = await openOn('c1');
    await user.keyboard('{Backspace}');
    expect(lengthInput()).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(editorEl()).toBeNull();
    expect(corners()).toEqual(R.outline);
  });

  it('Escape closes without applying, focus returns to the label, the wall stays selected and the key goes no further', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      const user = await openOn('c1');
      await user.keyboard('13');
      await user.keyboard('{Escape}');
      expect(onWindowKey).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
      expect(setWallLengthTo).not.toHaveBeenCalled();
      expect(editorEl()).toBeNull();
      expect(corners()).toEqual(R.outline);
      expect(label('c1')).toHaveFocus();
      expect(useUiStore.getState().selectedWallId).toBe('c1');
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
  });

  it('opening the editor on another wall closes the first without applying', async () => {
    const user = await openOn('c1');
    await user.keyboard('13');
    // A click that does not move focus, so only the opening itself acts on the first editor.
    fireEvent.click(label('c2'));
    expect(document.querySelectorAll('div.room-wall-editor')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Wall 2 length' })).toBe(editorEl());
    expect(screen.queryByRole('group', { name: 'Wall 1 length' })).toBeNull();
    expect(label('c1')).toBeInTheDocument();
    expect(setWallLengthTo).not.toHaveBeenCalled();
    expect(corners()).toEqual(R.outline);
  });

  it('is not rendered once the edited wall leaves the outline', async () => {
    await openOn('c2');
    expect(editorEl()).not.toBeNull();
    act(() => {
      usePlanStore.getState().applyOutline({ ok: true, outline: R.outline.filter((c) => c.id !== 'c2') });
    });
    expect(usePlanStore.getState().room.outline.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(editorEl()).toBeNull();
    expect(labels()).toHaveLength(3);
  });
});

describe('WallLengthLabels: arrow keys in the editor with the keyboard shortcuts on', () => {
  beforeEach(() => {
    renderHook(() => useKeyboardShortcuts());
  });

  it('arrow keys typed in the number input do not slide the wall', async () => {
    const user = await openOn('c1');
    expect(useUiStore.getState().selectedWallId).toBe('c1');
    await user.keyboard('{ArrowUp}{ArrowDown}{ArrowLeft}{ArrowRight}');
    expect(corners()).toEqual(R.outline);
    expect(editorEl()).not.toBeNull();
  });

  it('arrow keys on a radio move the choice between the three, wrap round, and do not slide the wall', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      const user = await openOn('c1');
      act(() => screen.getByRole('radio', { name: 'Corner 2 end' }).focus());
      await user.keyboard('{ArrowLeft}');
      expect(useUiStore.getState().lengthAnchor).toBe('both');
      expect(screen.getByRole('radio', { name: 'Both ends' })).toHaveFocus();
      expect(screen.getByRole('radio', { name: 'Both ends' })).toHaveAttribute('aria-checked', 'true');
      await user.keyboard('{ArrowLeft}');
      expect(useUiStore.getState().lengthAnchor).toBe('start');
      await user.keyboard('{ArrowLeft}');
      expect(useUiStore.getState().lengthAnchor).toBe('end');
      await user.keyboard('{ArrowRight}');
      expect(useUiStore.getState().lengthAnchor).toBe('start');
      expect(screen.getByRole('radio', { name: 'Corner 1 end' })).toHaveFocus();
      await user.keyboard('{ArrowRight}{ArrowDown}');
      expect(useUiStore.getState().lengthAnchor).toBe('end');
      await user.keyboard('{ArrowUp}');
      expect(useUiStore.getState().lengthAnchor).toBe('both');
      expect(onWindowKey).not.toHaveBeenCalled();
      expect(corners()).toEqual(R.outline);
      expect(editorEl()).not.toBeNull();
      expect(setWallLengthTo).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
  });

  it('only the checked radio is in the tab order', async () => {
    await openOn('c1');
    expect(screen.getByRole('radio', { name: 'Corner 2 end' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Corner 1 end' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Both ends' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('wall label styles (stage.css)', () => {
  // Vitest runs from the repo root; under jsdom import.meta.url is not a file URL.
  const css = readFileSync(resolve(process.cwd(), 'room-planner/components/Stage/stage.css'), 'utf8');

  /** The body of the rule whose selector is exactly `selector`. */
  function rule(selector: string): string {
    const at = css.indexOf(`\n${selector} {`);
    if (at < 0) throw new Error(`no rule ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  }

  it('a label is centred on its point, in the heading font at 12 px, on the page background', () => {
    const body = rule('.room-wall-label');
    for (const decl of [
      'position: absolute;',
      'transform: translate(-50%, -50%);',
      'font-family: var(--font-heading);',
      'font-size: 12px;',
      'background: var(--color-bg);',
      'pointer-events: auto;',
    ]) {
      expect(body).toContain(decl);
    }
  });

  it('labels take no pointer input while a door or window tool is armed', () => {
    expect(rule('.room-edit-layer.is-placing .room-wall-label')).toContain('pointer-events: none;');
  });

  it('a label looks clickable: a thin border, a text cursor, and an accent border on hover', () => {
    const body = rule('.room-wall-label');
    for (const decl of [
      'padding: 1px 6px;',
      'box-sizing: border-box;',
      'height: 18px;',
      'line-height: 14px;',
      'border: 1px solid color-mix(in srgb, var(--color-text) 35%, transparent);',
      'border-radius: 3px;',
      'cursor: text;',
    ]) {
      expect(body).toContain(decl);
    }
    expect(rule('.room-wall-label:hover')).toContain('border-color: var(--color-accent);');
  });

  it('the editor is centred on the label\'s point, above the corner handles, and takes pointer input', () => {
    const body = rule('.room-wall-editor');
    for (const decl of [
      'position: absolute;',
      'transform: translate(-50%, -50%);',
      'z-index: 9;',
      'pointer-events: auto;',
    ]) {
      expect(body).toContain(decl);
    }
    expect(rule('.room-corner')).toContain('z-index: 8;');
  });

  it('the selected label is accent-coloured and a focused one has the corner handles\' ring', () => {
    expect(rule('.room-wall-label[aria-pressed="true"]')).toContain('color: var(--color-accent-700);');
    const focus = rule('.room-wall-label:focus-visible');
    expect(focus).toContain('outline: 2px solid var(--color-accent-700);');
    expect(focus).toContain('outline-offset: 3px;');
    const corner = rule('.room-corner:focus-visible');
    expect(corner).toContain('outline: 2px solid var(--color-accent-700);');
    expect(corner).toContain('outline-offset: 3px;');
  });

  it('a moving-end mark is a dashed accent ring centred on its corner, taking no pointer input', () => {
    const body = rule('.room-wall-moving-end');
    for (const decl of [
      'position: absolute;',
      'width: 26px;',
      'height: 26px;',
      'transform: translate(-50%, -50%);',
      'border: 2px dashed var(--color-accent);',
      'border-radius: 50%;',
      'pointer-events: none;',
      'z-index: 7;',
    ]) {
      expect(body).toContain(decl);
    }
  });
});
