/**
 * The page address as it concerns share links: a plan travels in the fragment as `#plan=<data>`.
 *
 * What is read here comes from the address bar and is untrusted; it is handed on only as text, to
 * be decoded and checked elsewhere. Every function is wrapped so it never throws.
 */

const PREFIX = '#plan=';

/** The text after '#plan=' in the address, or null when the fragment does not start with '#plan='. */
export function readShareData(): string | null {
  try {
    const hash = window.location.hash;
    return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null;
  } catch {
    return null;
  }
}

/** Removes a '#plan=' fragment with history.replaceState, keeping path, query and history state. No-op otherwise. */
export function clearShareFragment(): void {
  try {
    if (!window.location.hash.startsWith(PREFIX)) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  } catch {
    // The address stays as it is.
  }
}

/** `${location.origin}${location.pathname}#plan=${data}` */
export function shareUrl(data: string): string {
  try {
    return `${window.location.origin}${window.location.pathname}${PREFIX}${data}`;
  } catch {
    return `${PREFIX}${data}`;
  }
}

/** Reloads the page. */
export function reloadPage(): void {
  try {
    window.location.reload();
  } catch {
    // Nothing to fall back to: the page stays as it is.
  }
}
