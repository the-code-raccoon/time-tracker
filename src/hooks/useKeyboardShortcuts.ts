import { useEffect, useLayoutEffect, useRef } from 'react';

/** Text fields, selects and editable content: typing there must not trigger shortcuts (§5.7). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select, [role="combobox"], [role="textbox"]');
}

/** Dialogs, menus and popovers handle their own keys. */
export function isInsideOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.MuiModal-root, .MuiPopover-root, [role="dialog"], [role="menu"]') !== null;
}

/**
 * Single-key shortcuts like Google Calendar's (§5.7), keyed by `KeyboardEvent.key` ("k", "?", "Delete"…).
 * Ignored while typing, inside a dialog or menu, and with Ctrl, ⌘ or Alt held.
 */
export function useKeyboardShortcuts(enabled: boolean, bindings: Record<string, () => void>) {
  const latest = useRef(bindings);
  useLayoutEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (isTypingTarget(event.target) || isInsideOverlay(event.target)) return;
      const action = latest.current[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
