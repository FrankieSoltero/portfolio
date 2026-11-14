import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmButton } from './ConfirmButton';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

const LABEL = 'Reset plan';
const CONFIRM = 'Erase everything and start over';

function renderButton(onConfirm: () => void = vi.fn()) {
  const view = render(<ConfirmButton label={LABEL} confirmLabel={CONFIRM} onConfirm={onConfirm} className="extra" />);
  return { ...view, onConfirm };
}

describe('ConfirmButton', () => {
  it('idle: renders one button named label, a real type="button"', () => {
    const { container } = renderButton();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(LABEL);
    expect(buttons[0]).toHaveAttribute('type', 'button');
    expect(container.firstElementChild).toHaveClass('confirm-button');
    expect(container.firstElementChild).toHaveClass('extra');
  });

  it('armed: one click shows confirmLabel and Cancel buttons, does not confirm, and focuses Cancel', async () => {
    const { onConfirm } = renderButton();
    await userEvent.setup().click(screen.getByRole('button', { name: LABEL }));
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([CONFIRM, 'Cancel']);
    for (const b of buttons) expect(b).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('confirm: clicking confirmLabel calls onConfirm once and returns to idle', async () => {
    const { onConfirm } = renderButton();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: LABEL }));
    await user.click(screen.getByRole('button', { name: CONFIRM }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: LABEL })).toHaveFocus();
  });

  it('confirm: a double click on confirmLabel calls a promise-returning onConfirm only once', async () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined));
    renderButton(onConfirm);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: LABEL }));
    const confirm = screen.getByRole('button', { name: CONFIRM });
    await user.dblClick(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('confirm: two clicks handled before a re-render call onConfirm only once', async () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined));
    renderButton(onConfirm);
    await userEvent.setup().click(screen.getByRole('button', { name: LABEL }));
    const confirm = screen.getByRole('button', { name: CONFIRM });
    // Inside one act() React defers the re-render, so both clicks reach the same armed button.
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: LABEL })).toBeInTheDocument();
  });

  it('cancel: clicking Cancel returns to idle with focus on the label button and does not confirm', async () => {
    const { onConfirm } = renderButton();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: LABEL }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: LABEL })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancel: Escape while armed returns to idle with focus on the label button, and does not reach window', async () => {
    const { onConfirm } = renderButton();
    const user = userEvent.setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      await user.click(screen.getByRole('button', { name: LABEL }));
      await user.keyboard('{Escape}');
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button', { name: LABEL })).toHaveFocus();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
  });

  it('idle: Escape is not swallowed (it still reaches window)', async () => {
    renderButton();
    const user = userEvent.setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      screen.getByRole('button', { name: LABEL }).focus();
      await user.keyboard('{Escape}');
      expect(onWindowKey).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
  });
});
