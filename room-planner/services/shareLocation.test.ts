import { afterEach, describe, expect, it } from 'vitest';
import { clearShareFragment, readShareData, reloadPage, shareUrl } from './shareLocation';

const START = window.location.pathname;

/** Puts `url` (relative to the origin) in the address without navigating, with `state` as history state. */
function goTo(url: string, state: unknown = null): void {
  window.history.replaceState(state, '', url);
}

afterEach(() => {
  goTo(START);
});

describe('readShareData', () => {
  it('is null when the address has no fragment', () => {
    goTo('/room-planner');
    expect(readShareData()).toBeNull();
  });

  it('is the text after #plan=', () => {
    goTo('/room-planner#plan=1.abc_-XYZ');
    expect(readShareData()).toBe('1.abc_-XYZ');
  });

  it('is an empty string for a fragment that is exactly #plan=', () => {
    goTo('/room-planner#plan=');
    expect(readShareData()).toBe('');
  });

  it.each(['#other=1', '#planx=1', '#PLAN=1', '#', '#x#plan=1', '#plan'])(
    'is null for the fragment %s',
    (fragment) => {
      goTo(`/room-planner${fragment}`);
      expect(readShareData()).toBeNull();
    },
  );
});

describe('clearShareFragment', () => {
  it('removes a #plan= fragment, keeping path, query and history state, without a new history entry', () => {
    const state = { kept: 1 };
    goTo('/room-planner/x?a=1&b=2#plan=1.abc', state);
    const entries = window.history.length;
    clearShareFragment();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/room-planner/x');
    expect(window.location.search).toBe('?a=1&b=2');
    expect(window.location.href).toBe(`${window.location.origin}/room-planner/x?a=1&b=2`);
    expect(window.history.state).toEqual(state);
    expect(window.history.length).toBe(entries);
    expect(readShareData()).toBeNull();
  });

  it('removes a fragment that is exactly #plan=', () => {
    goTo('/room-planner#plan=');
    clearShareFragment();
    expect(window.location.href).toBe(`${window.location.origin}/room-planner`);
  });

  it.each(['/room-planner#other=1', '/room-planner?a=1', '/room-planner'])('leaves %s untouched', (url) => {
    const state = { kept: 2 };
    goTo(url, state);
    const href = window.location.href;
    clearShareFragment();
    expect(window.location.href).toBe(href);
    expect(window.history.state).toEqual(state);
  });
});

describe('shareUrl', () => {
  it('is the origin and path with #plan= and the data, dropping any query and fragment', () => {
    goTo('/room-planner?a=1#plan=old');
    expect(shareUrl('1.new')).toBe(`${window.location.origin}/room-planner#plan=1.new`);
  });
});

describe('reloadPage', () => {
  it('does not throw', () => {
    // jsdom cannot navigate: it prints "Not implemented: navigation" for the attempted reload.
    expect(() => reloadPage()).not.toThrow();
  });
});
