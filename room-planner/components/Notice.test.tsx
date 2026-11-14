import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../state/uiStore';
import { Notice } from './Notice';

beforeEach(() => {
  useUiStore.getState().reset();
});

describe('Notice', () => {
  it('renders nothing while there is no notice', () => {
    const { container } = render(<Notice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the notice text in a status element with a Dismiss button that clears it', () => {
    act(() => useUiStore.getState().setNotice('Something to know.'));
    const { container } = render(<Notice />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Something to know.');
    expect(status).toHaveClass('notice');
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveAttribute('type', 'button');
    fireEvent.click(dismiss);
    expect(useUiStore.getState().notice).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
