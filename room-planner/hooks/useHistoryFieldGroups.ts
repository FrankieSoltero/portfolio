import { useEffect } from 'react';
import { closeGroup, openGroup, renewFieldGroup } from '../state/historyStore';

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

/** True for a textarea, or an input whose type is not one of NOT_TEXT_TYPES. A select is not a text field. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT_TYPES.has(target.type.toLowerCase());
  return false;
}

function onFocusIn(e: FocusEvent): void {
  if (isTextField(e.target)) openGroup('field');
}

function onFocusOut(e: FocusEvent): void {
  if (isTextField(e.target)) closeGroup('field');
}

/**
 * A press anywhere but the focused text field ends the current step, even when the pressed
 * element does not take focus (Safari does not focus a clicked button), so the press's own
 * change is a step of its own. The field group stays open for any further typing.
 */
function onPointerDown(e: PointerEvent): void {
  const active = document.activeElement;
  if (isTextField(active) && e.target instanceof Node && active?.contains(e.target)) return;
  renewFieldGroup();
}

/**
 * Typing in a text field is one undo step: focusing a text field opens a field group and leaving
 * it closes the group. A field already focused when the hook mounts is covered too. The press
 * listener runs in the capture phase so an element that stops the event cannot hide it.
 */
export function useHistoryFieldGroups(): void {
  useEffect(() => {
    if (isTextField(document.activeElement)) openGroup('field');
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      closeGroup('field');
    };
  }, []);
}
