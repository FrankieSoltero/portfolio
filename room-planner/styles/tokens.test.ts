import { afterEach, describe, expect, it } from 'vitest';
import { PLANNER_ROOT_CLASS, readTokens } from './tokens';

const VARS: Record<string, string> = {
  '--color-bg': ' rgb(244, 241, 234) ',
  '--color-text': ' rgb(29, 29, 27)',
  '--color-neutral-100': 'rgb(233, 229, 220) ',
  '--color-neutral-200': ' rgb(214, 209, 197)',
  '--color-accent-100': ' rgb(219, 230, 243)',
  '--color-accent-200': 'rgb(183, 205, 231)',
  '--color-accent-300': ' rgb(143, 176, 216) ',
  '--color-accent-400': 'rgb(95, 140, 196)',
  '--color-accent-700': ' rgb(31, 74, 128)',
};

const root = document.documentElement;

/** Mounts a planner wrapper element, as PlannerRoot renders it, and returns it. */
function mountWrapper(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = PLANNER_ROOT_CLASS;
  document.body.appendChild(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const name of Object.keys(VARS)) root.style.removeProperty(name);
  document.body.replaceChildren();
});

describe('PLANNER_ROOT_CLASS', () => {
  it('is the wrapper class the scoped stylesheets target', () => {
    expect(PLANNER_ROOT_CLASS).toBe('room-planner');
  });
});

describe('readTokens', () => {
  it('returns the CSS variables on the .room-planner wrapper, trimmed', () => {
    const wrapper = mountWrapper();
    for (const [name, value] of Object.entries(VARS)) wrapper.style.setProperty(name, value);
    expect(readTokens()).toEqual({
      bg: 'rgb(244, 241, 234)',
      text: 'rgb(29, 29, 27)',
      n100: 'rgb(233, 229, 220)',
      n200: 'rgb(214, 209, 197)',
      a100: 'rgb(219, 230, 243)',
      a200: 'rgb(183, 205, 231)',
      a300: 'rgb(143, 176, 216)',
      a400: 'rgb(95, 140, 196)',
      a700: 'rgb(31, 74, 128)',
    });
  });

  it('returns null while --color-text is unset on the wrapper', () => {
    const wrapper = mountWrapper();
    for (const [name, value] of Object.entries(VARS)) {
      if (name !== '--color-text') wrapper.style.setProperty(name, value);
    }
    expect(readTokens()).toBeNull();
  });

  it('returns null without throwing when no .room-planner element exists, even if the root has the variables', () => {
    for (const [name, value] of Object.entries(VARS)) root.style.setProperty(name, value);
    expect(() => readTokens()).not.toThrow();
    expect(readTokens()).toBeNull();
  });
});
