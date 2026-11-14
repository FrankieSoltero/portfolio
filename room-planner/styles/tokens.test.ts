import { afterEach, describe, expect, it } from 'vitest';
import { readTokens } from './tokens';

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

afterEach(() => {
  for (const name of Object.keys(VARS)) root.style.removeProperty(name);
});

describe('readTokens', () => {
  it('returns the CSS variables on documentElement, trimmed', () => {
    for (const [name, value] of Object.entries(VARS)) root.style.setProperty(name, value);
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

  it('returns null while --color-text is unset', () => {
    for (const [name, value] of Object.entries(VARS)) {
      if (name !== '--color-text') root.style.setProperty(name, value);
    }
    expect(readTokens()).toBeNull();
  });
});
