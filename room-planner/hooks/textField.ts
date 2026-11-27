/** Input types that are not text fields: typing never happens in them. */
const NOT_TEXT_TYPES: ReadonlySet<string> = new Set([
  'radio',
  'checkbox',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
]);

/**
 * True for a textarea, or an input whose type is not one of NOT_TEXT_TYPES. A select is not a text
 * field. These are the fields with a text undo of their own in the browser.
 */
export function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT_TYPES.has(target.type.toLowerCase());
  return false;
}
