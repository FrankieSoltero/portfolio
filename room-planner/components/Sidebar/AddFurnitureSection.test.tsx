import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KIND_LABELS, KIND_ORDER, TYPICAL_SIZE } from '../../domain/furniture/recipe';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { AddFurnitureSection } from './AddFurnitureSection';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

function typeButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.add-furniture-kinds > button'));
}

describe('AddFurnitureSection', () => {
  it('renders a section headed 02 then Add furniture, with the line about changing a piece after it is placed', () => {
    const { container } = render(<AddFurnitureSection />);
    expect(container.querySelector('section')).toHaveClass('sidebar-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading.querySelector('.sidebar-heading-num')).toHaveTextContent('02');
    expect(heading).toHaveTextContent(/^02Add furniture$/);
    expect(screen.getByText('Pick a type. You can change its size, style and colours after it is placed.')).toBeInTheDocument();
  });

  it('shows 11 secondary buttons, one per kind in KIND_ORDER, named by KIND_LABELS', () => {
    const { container } = render(<AddFurnitureSection />);
    const buttons = typeButtons(container);
    expect(buttons).toHaveLength(11);
    expect(buttons.map((b) => b.textContent)).toEqual(KIND_ORDER.map((k) => KIND_LABELS[k]));
    for (const b of buttons) {
      expect(b).toHaveAttribute('type', 'button');
      expect(b).toHaveClass('btn', 'btn-secondary');
      expect(b).toBeEnabled();
    }
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('clicking Dresser adds a dresser at its typical size and selects it', async () => {
    render(<AddFurnitureSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dresser' }));
    const { items } = usePlanStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'dresser', name: 'Dresser', ...TYPICAL_SIZE.dresser });
    expect(useUiStore.getState().selectedId).toBe(items[0]?.id);
  });

  it('disables the 11 type buttons in room-edit mode', async () => {
    useUiStore.getState().setMode('room');
    const { container } = render(<AddFurnitureSection />);
    const buttons = typeButtons(container);
    expect(buttons).toHaveLength(11);
    for (const b of buttons) expect(b).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    expect(usePlanStore.getState().items).toEqual([]);
  });
});
