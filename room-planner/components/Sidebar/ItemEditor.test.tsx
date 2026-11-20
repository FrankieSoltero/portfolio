import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SWATCHES } from '../../domain/furniture/recipe';
import type { Item, Kind } from '../../domain/types';
import { clearHistory, redo, undo } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { modelKey } from '../../three/modelSource';
import type { PaneRect } from '../../view/panes';
import { PlanView } from '../Stage/PlanView';
import { ItemList } from './ItemList';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  clearHistory();
});

const MAIN: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };

/** Adds a piece of `kind` through the store, selects it and returns its id. */
function addSelected(kind: Kind): string {
  const id = usePlanStore.getState().addFurniture(kind);
  if (id === null) throw new Error('not added');
  act(() => useUiStore.getState().select(id));
  return id;
}

function stored(id: string): Item {
  const item = usePlanStore.getState().items.find((i) => i.id === id);
  if (item === undefined) throw new Error('missing item');
  return item;
}

function editor(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-item-editor]');
  if (el === null) throw new Error('no editor');
  return el;
}

function radioNames(): (string | null)[] {
  return within(editor())
    .queryAllByRole('radiogroup')
    .map((g) => g.getAttribute('aria-label'));
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLElement, value: string): void {
  Object.defineProperty(el, 'value', { configurable: true, writable: true, value });
  fireEvent.change(el);
}

function radio(group: string, name: string): HTMLInputElement {
  return within(within(editor()).getByRole('radiogroup', { name: group })).getByRole('radio', { name }) as HTMLInputElement;
}

function swatch(group: 'Main colour' | 'Accent colour', name: string): HTMLElement {
  return within(within(editor()).getByRole('group', { name: group })).getByRole('button', { name });
}

describe('ItemEditor', () => {
  it('shows Name, Type, the three sizes, the six sofa option groups and both colour groups, in that order', () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    const ed = within(editor());
    const controls = [
      ed.getByRole('textbox', { name: 'Name' }),
      ed.getByRole('combobox', { name: 'Type' }),
      ed.getByRole('spinbutton', { name: 'Width (in)' }),
      ed.getByRole('spinbutton', { name: 'Depth (in)' }),
      ed.getByRole('spinbutton', { name: 'Height (in)' }),
      ...ed.getAllByRole('radiogroup'),
      ed.getByRole('group', { name: 'Main colour' }),
      ed.getByRole('group', { name: 'Accent colour' }),
    ];
    for (let i = 1; i < controls.length; i++) {
      expect(controls[i - 1].compareDocumentPosition(controls[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(radioNames()).toEqual(['Seats', 'Arms', 'Back', 'Cushions', 'Legs', 'Chaise']);
    expect(radio('Arms', 'Track')).toHaveAttribute('name', `style-${id}-arms`);
    // Each option's label is also shown as visible text.
    expect(ed.getByText('Arms')).toBeVisible();
    expect(ed.getByRole('textbox', { name: 'Name' })).toHaveAttribute('maxLength', '200');
  });

  it('shows no option groups for a box and Columns, Rows, Base, Handles for a dresser', () => {
    addSelected('box');
    const { unmount } = render(<ItemList />);
    expect(radioNames()).toEqual([]);
    unmount();
    addSelected('dresser');
    render(<ItemList />);
    expect(radioNames()).toEqual(['Columns', 'Rows', 'Base', 'Handles']);
  });

  it('a click on Slim in Arms stores arms slim and checks Slim, not Track', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    await userEvent.setup().click(radio('Arms', 'Slim'));
    expect(stored(id).style.arms).toBe('slim');
    expect(radio('Arms', 'Slim').checked).toBe(true);
    expect(radio('Arms', 'Track').checked).toBe(false);
  });

  it('a click on Slim redraws the sofa’s plan parts and changes its model key', async () => {
    const id = addSelected('sofa');
    render(
      <>
        <ItemList />
        <PlanView pane={MAIN} />
      </>,
    );
    const parts = () => Array.from(document.querySelectorAll('.plan-part')).map((p) => p.getAttribute('style'));
    const partsBefore = parts();
    const keyBefore = modelKey(stored(id));
    expect(partsBefore.length).toBeGreaterThan(0);
    await userEvent.setup().click(radio('Arms', 'Slim'));
    expect(parts()).not.toEqual(partsBefore);
    expect(modelKey(stored(id))).not.toBe(keyBefore);
  });

  it('has class item-editor and data-item-editor on its root and item-swatch on every swatch', () => {
    addSelected('sofa');
    render(<ItemList />);
    expect(editor()).toHaveClass('item-editor');
    expect(editor()).toHaveAttribute('data-item-editor');
    for (const group of ['Main colour', 'Accent colour'] as const) {
      const buttons = within(within(editor()).getByRole('group', { name: group })).getAllByRole('button');
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(SWATCHES.map((s) => s.label));
      for (const b of buttons) expect(b).toHaveClass('item-swatch');
    }
    expect(swatch('Main colour', 'Navy').style.backgroundColor).toBe('rgb(47, 64, 87)');
  });

  it('a click on Navy under Main colour stores #2f4057 and presses that swatch', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    expect(swatch('Main colour', 'Navy')).toHaveAttribute('aria-pressed', 'false');
    // The sofa starts Slate, which is a swatch.
    expect(swatch('Main colour', 'Slate')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(swatch('Main colour', 'Navy'));
    expect(stored(id).colours.main).toBe('#2f4057');
    expect(swatch('Main colour', 'Navy')).toHaveAttribute('aria-pressed', 'true');
    expect(swatch('Main colour', 'Slate')).toHaveAttribute('aria-pressed', 'false');
    expect(swatch('Accent colour', 'Navy')).toHaveAttribute('aria-pressed', 'false');
  });

  it('custom colour changes within the merge window are stored and undone in one step', () => {
    const id = addSelected('sofa');
    const original = stored(id).colours.main;
    render(<ItemList />);
    const custom = within(editor()).getByLabelText('Custom main colour') as HTMLInputElement;
    expect(custom).toHaveAttribute('type', 'color');
    expect(custom.value).toBe(original);
    fireEvent.input(custom, { target: { value: '#123456' } });
    fireEvent.input(custom, { target: { value: '#123456' } });
    expect(stored(id).colours.main).toBe('#123456');
    // A drag through the picker reports a run of different colours.
    fireEvent.input(custom, { target: { value: '#abcdef' } });
    expect(stored(id).colours.main).toBe('#abcdef');
    expect(custom.value).toBe('#abcdef');
    act(() => {
      undo();
    });
    expect(stored(id).colours.main).toBe(original);
    expect(custom.value).toBe(original);
  });

  it('the custom accent colour stores the accent', () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    fireEvent.input(within(editor()).getByLabelText('Custom accent colour'), { target: { value: '#123456' } });
    expect(stored(id).colours.accent).toBe('#123456');
  });

  it('sizes: 90 in Width stores 90, abc keeps the text and the width, and in metric 100 stores 100 cm', () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    const width = () => within(editor()).getByLabelText(/^Width/) as HTMLInputElement;
    typeRaw(width(), '90');
    expect(stored(id).w).toBe(90);
    typeRaw(width(), 'abc');
    expect(width().value).toBe('abc');
    expect(stored(id).w).toBe(90);
    act(() => usePlanStore.getState().setUnits('m'));
    typeRaw(within(editor()).getByLabelText('Width (cm)'), '100');
    expect(stored(id).w).toBeCloseTo(39.37, 2);
    typeRaw(within(editor()).getByLabelText('Depth (cm)'), '50');
    typeRaw(within(editor()).getByLabelText('Height (cm)'), '60');
    expect(stored(id).d).toBeCloseTo(19.69, 2);
    expect(stored(id).h).toBeCloseTo(23.62, 2);
  });

  it('a typed name shows in the row and the plan label; a cleared field keeps the stored name', async () => {
    const id = addSelected('sofa');
    render(
      <>
        <ItemList />
        <PlanView pane={MAIN} />
      </>,
    );
    const user = userEvent.setup();
    const name = within(editor()).getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
    await user.clear(name);
    expect(name.value).toBe('');
    expect(stored(id).name).toBe('Sofa');
    await user.type(name, 'Green couch ');
    expect(stored(id).name).toBe('Green couch');
    // The trailing space stays in the field while typing.
    expect(name.value).toBe('Green couch ');
    expect(document.querySelector('.item-row-name')).toHaveTextContent('Green couch');
    expect(document.querySelector('.plan-item-name')).toHaveTextContent('Green couch');
    await user.clear(name);
    expect(stored(id).name).toBe('Green couch');
    expect(name.value).toBe('');
    // Leaving an empty field shows the stored name again.
    act(() => name.blur());
    expect(name.value).toBe('Green couch');
  });

  it('the Name field follows a stored name changed elsewhere', () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    act(() => {
      usePlanStore.getState().updateItem(id, { name: 'Renamed' });
    });
    expect(within(editor()).getByRole('textbox', { name: 'Name' })).toHaveValue('Renamed');
  });

  it('choosing Bed as the Type makes a bed with the bed’s option groups', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    await userEvent.setup().selectOptions(within(editor()).getByRole('combobox', { name: 'Type' }), 'Bed');
    expect(stored(id).kind).toBe('bed');
    expect(radioNames()).toEqual(['Headboard', 'Headboard finish', 'Footboard', 'Base']);
    // The name was the sofa's label, so it follows the type.
    expect(within(editor()).getByRole('textbox', { name: 'Name' })).toHaveValue('Bed');
  });

  it('lists every type by its label in the Type select', () => {
    addSelected('sofa');
    render(<ItemList />);
    const options = within(within(editor()).getByRole('combobox', { name: 'Type' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Sofa', 'Chair', 'Bed', 'Desk', 'Table', 'Shelf', 'Dresser', 'Nightstand', 'TV stand', 'Rug', 'Box',
    ]);
  });

  it('an option click is one undo step; redo puts it back, and the editor shows each', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    await userEvent.setup().click(radio('Arms', 'Slim'));
    act(() => {
      undo();
    });
    expect(stored(id).style.arms).toBe('track');
    expect(radio('Arms', 'Track').checked).toBe(true);
    act(() => {
      redo();
    });
    expect(stored(id).style.arms).toBe('slim');
    expect(radio('Arms', 'Slim').checked).toBe(true);
  });

  it('a swatch pick is one undo step; redo puts it back, and the editor shows each', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    await userEvent.setup().click(swatch('Accent colour', 'Brass'));
    expect(stored(id).colours.accent).toBe('#b08d57');
    act(() => {
      undo();
    });
    expect(stored(id).colours.accent).toBe('#3b2f27');
    expect(swatch('Accent colour', 'Brass')).toHaveAttribute('aria-pressed', 'false');
    expect(swatch('Accent colour', 'Espresso')).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      redo();
    });
    expect(swatch('Accent colour', 'Brass')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a Type change is one undo step', async () => {
    const id = addSelected('sofa');
    render(<ItemList />);
    await userEvent.setup().selectOptions(within(editor()).getByRole('combobox', { name: 'Type' }), 'Bed');
    act(() => {
      undo();
    });
    expect(stored(id).kind).toBe('sofa');
    expect(within(editor()).getByRole('combobox', { name: 'Type' })).toHaveValue('sofa');
  });

  it('every control is reachable by role and name', () => {
    addSelected('sofa');
    render(<ItemList />);
    const ed = within(editor());
    expect(ed.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(ed.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
    for (const n of ['Width (in)', 'Depth (in)', 'Height (in)']) expect(ed.getByRole('spinbutton', { name: n })).toBeInTheDocument();
    for (const g of ['Seats', 'Arms', 'Back', 'Cushions', 'Legs', 'Chaise']) {
      const group = ed.getByRole('radiogroup', { name: g });
      expect(within(group).getAllByRole('radio').length).toBeGreaterThan(1);
    }
    for (const g of ['Main colour', 'Accent colour'] as const) {
      for (const s of SWATCHES) expect(swatch(g, s.label)).toBeInTheDocument();
    }
    // A colour input has no ARIA role, so it is found by its label.
    expect(ed.getByLabelText('Custom main colour')).toBeInTheDocument();
    expect(ed.getByLabelText('Custom accent colour')).toBeInTheDocument();
  });
});
