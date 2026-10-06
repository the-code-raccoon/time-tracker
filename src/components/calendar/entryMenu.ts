import type { MouseEvent } from 'react';
import type { TimeEntry } from '../../../shared/types';

export type OpenEntryMenu = (entry: TimeEntry, position: { x: number; y: number }) => void;

/**
 * Position for a `contextmenu` event. Keyboard-triggered ones (context-menu key, Shift+F10)
 * have no pointer position, so the menu opens at the element instead.
 */
export function contextMenuPosition(event: MouseEvent<HTMLElement>): { x: number; y: number } {
  if (event.clientX === 0 && event.clientY === 0) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left + 8, y: rect.top + 8 };
  }
  return { x: event.clientX, y: event.clientY };
}
