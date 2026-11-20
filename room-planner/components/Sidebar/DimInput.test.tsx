import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { usePlanStore } from '../../state/planStore';
import { DimInput } from './DimInput';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
});

const RANGE = { min: CONFIG.itemDimMin, max: CONFIG.itemDimMax };

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLInputElement, value: string): void {
  Object.defineProperty(el, 'value', { configurable: true, writable: true, value });
  fireEvent.change(el);
}

/** Renders a width input for `stored` inches; returns the onValue spy and a way to change the stored value. */
function renderWidth(stored: number) {
  const onValue = vi.fn();
  const view = render(<DimInput label="Width" stored={stored} {...RANGE} onValue={onValue} />);
  const setStored = (next: number) => view.rerender(<DimInput label="Width" stored={next} {...RANGE} onValue={onValue} />);
  return { onValue, setStored };
}

describe('DimInput', () => {
  it('shows the stored value in the plan’s units: inches, or whole centimetres', () => {
    renderWidth(84);
    expect(input('Width (in)').value).toBe('84');
    act(() => usePlanStore.getState().setUnits('m'));
    expect(input('Width (cm)').value).toBe('213');
  });

  it('calls onValue with inches for an in-range length, keeping a partial entry as typed', () => {
    const { onValue } = renderWidth(84);
    typeRaw(input('Width (in)'), '90.');
    expect(onValue).toHaveBeenCalledWith(90);
    expect(input('Width (in)').value).toBe('90.');
    act(() => usePlanStore.getState().setUnits('m'));
    typeRaw(input('Width (cm)'), '254');
    expect(onValue).toHaveBeenLastCalledWith(100);
  });

  it('keeps text that does not parse and does not call onValue', () => {
    const { onValue } = renderWidth(84);
    typeRaw(input('Width (in)'), '');
    expect(input('Width (in)').value).toBe('');
    typeRaw(input('Width (in)'), '-');
    expect(input('Width (in)').value).toBe('-');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('does not call onValue for a length outside [min, max], keeping it in the input', () => {
    const { onValue } = renderWidth(84);
    for (const raw of ['0', '0.2', '241']) {
      typeRaw(input('Width (in)'), raw);
      expect(input('Width (in)').value).toBe(raw);
    }
    expect(onValue).not.toHaveBeenCalled();
  });

  it('re-seeds the draft when the units change, even when the draft parses to the stored length', () => {
    renderWidth(100);
    // 254.0 in is out of range, so the stored length stays 100 in, which is exactly 254 cm.
    typeRaw(input('Width (in)'), '254.0');
    act(() => usePlanStore.getState().setUnits('m'));
    expect(input('Width (cm)').value).toBe('254');
  });

  it('re-seeds the draft when the stored value changes to one it does not show, and keeps one that shows it', () => {
    const { setStored } = renderWidth(84);
    typeRaw(input('Width (in)'), '90.');
    setStored(90);
    expect(input('Width (in)').value).toBe('90.');
    setStored(50);
    expect(input('Width (in)').value).toBe('50');
  });
});
