import { useEffect } from 'react';
import { closeGroup, openGroup, renewFieldGroup } from '../state/historyStore';
import { isTextField } from './textField';

/**
 * Focus on a text field opens a field group; focus on anything else closes it. The close matters
 * when the focused field was removed from the page, which fires no focusout.
 */
function onFocusIn(e: FocusEvent): void {
  if (isTextField(e.target)) openGroup('field');
  else closeGroup('field');
}

function onFocusOut(e: FocusEvent): void {
  if (isTextField(e.target)) closeGroup('field');
}

/**
 * A press anywhere but the focused text field ends the current step, even when the pressed
 * element does not take focus (Safari does not focus a clicked button), so the press's own
 * change is a step of its own. The field group stays open for any further typing. With no text
 * field focused (say the focused one was removed from the page, which fires no focusout) the
 * field group is closed instead.
 */
function onPointerDown(e: PointerEvent): void {
  const active = document.activeElement;
  if (!isTextField(active)) {
    closeGroup('field');
    return;
  }
  if (e.target instanceof Node && active?.contains(e.target)) return;
  renewFieldGroup();
}

/**
 * A key pressed with no text field focused closes the field group, so a focused field removed from
 * the page (which fires no focusout) cannot keep its step open. It runs in the capture phase on the
 * document, before the window's keyboard shortcuts change the plan.
 */
function onKeyDown(): void {
  if (!isTextField(document.activeElement)) closeGroup('field');
}

/**
 * Typing in a text field is one undo step: focusing a text field opens a field group and leaving
 * it closes the group. A field already focused when the hook mounts is covered too. Focus, a
 * press or a key press found anywhere but a text field also closes the group, since a focused field
 * removed from the page fires no focusout. The press and key listeners run in the capture phase so
 * an element that stops the event cannot hide it, and the key listener runs before the window's
 * keyboard shortcuts.
 */
export function useHistoryFieldGroups(): void {
  useEffect(() => {
    if (isTextField(document.activeElement)) openGroup('field');
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      closeGroup('field');
    };
  }, []);
}
