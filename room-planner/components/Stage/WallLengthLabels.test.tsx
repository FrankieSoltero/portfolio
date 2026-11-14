import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { wallFrame, wallsOf } from '../../domain/outline';
import { fmtLen } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { planDoc, rectRoom } from '../../test/fixtures';
import { type PlanLayout, toPane } from '../../view/planLayout';
import { WallLengthLabels } from './WallLengthLabels';

/** R: c1 (0,0), c2 (144,0), c3 (144,168), c4 (0,168). */
const R = rectRoom(144, 168, 96);
const LAYOUT: PlanLayout = { scale: 2, ox: 10, oy: 20 };

beforeEach(() => {
  usePlanStore.getState().reset(planDoc(R, [], 'ft'));
  useUiStore.getState().reset();
  useUiStore.getState().setMode('room');
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

  it('puts each label at the wall midpoint in pane px, moved wallLabelOffsetPx outside the room', () => {
    expect(CONFIG.wallLabelOffsetPx).toBe(18);
    render(<WallLengthLabels layout={LAYOUT} />);
    for (const w of wallsOf(R.outline)) {
      const { n } = wallFrame(w);
      const mid = toPane({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, LAYOUT);
      const el = label(w.id);
      expect(parseFloat(el.style.left)).toBeCloseTo(mid.x - CONFIG.wallLabelOffsetPx * n.x, 6);
      expect(parseFloat(el.style.top)).toBeCloseTo(mid.y - CONFIG.wallLabelOffsetPx * n.y, 6);
    }
    // The top wall's label sits above it: midpoint (72, 0) is pane (154, 20), so 18 px up.
    expect(parseFloat(label('c1').style.left)).toBeCloseTo(154, 6);
    expect(parseFloat(label('c1').style.top)).toBeCloseTo(2, 6);
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

  it('the selected label is accent-coloured and a focused one has the corner handles\' ring', () => {
    expect(rule('.room-wall-label[aria-pressed="true"]')).toContain('color: var(--color-accent-700);');
    const focus = rule('.room-wall-label:focus-visible');
    expect(focus).toContain('outline: 2px solid var(--color-accent-700);');
    expect(focus).toContain('outline-offset: 3px;');
    const corner = rule('.room-corner:focus-visible');
    expect(corner).toContain('outline: 2px solid var(--color-accent-700);');
    expect(corner).toContain('outline-offset: 3px;');
  });
});
