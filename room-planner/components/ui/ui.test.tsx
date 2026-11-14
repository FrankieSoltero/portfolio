import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlueprintCorners } from './BlueprintCorners';
import { Segmented } from './Segmented';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

type View = 'plan' | 'split' | 'model';

const OPTIONS = [
  { value: 'plan', label: 'Plan' },
  { value: 'split', label: 'Split' },
  { value: 'model', label: 'Model' },
] as const satisfies readonly { value: View; label: string }[];

describe('Segmented', () => {
  it('renders one radio per option in a radiogroup, the value checked, all sharing the name', () => {
    render(<Segmented<View> name="view" aria-label="View" value="split" options={OPTIONS} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'View' });
    expect(group).toHaveClass('seg');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, true, false]);
    for (const r of radios) {
      expect(r).toHaveAttribute('name', 'view');
      expect(r.closest('label')).toHaveClass('seg-opt');
    }
    expect(screen.getByRole('radio', { name: 'Model' })).toBeInTheDocument();
  });

  it('calls onChange once with the clicked value', async () => {
    const onChange = vi.fn();
    render(<Segmented<View> name="view" aria-label="View" value="split" options={OPTIONS} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Model' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('model');
  });

  it('disables an option marked disabled so it cannot be selected', async () => {
    const onChange = vi.fn();
    const options = [OPTIONS[0], OPTIONS[1], { ...OPTIONS[2], disabled: true }];
    render(<Segmented<View> name="view" aria-label="View" value="split" options={options} onChange={onChange} />);
    const model = screen.getByRole('radio', { name: 'Model' });
    expect(model).toBeDisabled();
    await userEvent.setup().click(screen.getByText('Model'));
    expect(onChange).not.toHaveBeenCalled();
    expect(model).not.toBeChecked();
  });

  it('passes className and style through to the group', () => {
    render(
      <Segmented<View>
        name="view"
        aria-label="View"
        value="plan"
        options={OPTIONS}
        onChange={() => {}}
        className="extra"
        style={{ marginLeft: '4px' }}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'View' });
    expect(group).toHaveClass('seg', 'extra');
    expect(group).toHaveStyle({ marginLeft: '4px' });
  });
});

describe('BlueprintCorners', () => {
  it('renders exactly four hidden corner marks: tl, tr, bl, br', () => {
    const { container } = render(<BlueprintCorners />);
    const corners = [...container.querySelectorAll('i.corner')];
    expect(corners).toHaveLength(4);
    expect(corners.map((c) => c.className)).toEqual(['corner tl', 'corner tr', 'corner bl', 'corner br']);
    for (const c of corners) expect(c).toHaveAttribute('aria-hidden', 'true');
  });
});
