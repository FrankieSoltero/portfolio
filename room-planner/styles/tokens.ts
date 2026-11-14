/** Resolved colour tokens for canvas drawing, read from the CSS variables on the document root. */
export interface Tokens {
  bg: string;
  text: string;
  n100: string;
  n200: string;
  a100: string;
  a200: string;
  a300: string;
  a400: string;
  a700: string;
}

const VARIABLES: Readonly<Record<keyof Tokens, string>> = {
  bg: '--color-bg',
  text: '--color-text',
  n100: '--color-neutral-100',
  n200: '--color-neutral-200',
  a100: '--color-accent-100',
  a200: '--color-accent-200',
  a300: '--color-accent-300',
  a400: '--color-accent-400',
  a700: '--color-accent-700',
};

/** Reads the colour tokens from `document.documentElement`; null until the stylesheet has applied. */
export function readTokens(): Tokens | null {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  if (!read(VARIABLES.text)) return null;
  return {
    bg: read(VARIABLES.bg),
    text: read(VARIABLES.text),
    n100: read(VARIABLES.n100),
    n200: read(VARIABLES.n200),
    a100: read(VARIABLES.a100),
    a200: read(VARIABLES.a200),
    a300: read(VARIABLES.a300),
    a400: read(VARIABLES.a400),
    a700: read(VARIABLES.a700),
  };
}
