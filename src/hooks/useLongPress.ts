import { useRef, type PointerEvent } from 'react';

const DELAY_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * CTX-1: long-press on touch screens. Returns pointer handlers to spread on the element.
 * The click that follows a long press is swallowed via `wasLongPress()`.
 */
export function useLongPress(onLongPress: (position: { x: number; y: number }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    origin.current = null;
  };

  return {
    handlers: {
      onPointerDown(event: PointerEvent) {
        fired.current = false;
        if (event.pointerType !== 'touch') return;
        const position = { x: event.clientX, y: event.clientY };
        origin.current = position;
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress(position);
        }, DELAY_MS);
      },
      onPointerMove(event: PointerEvent) {
        if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > MOVE_TOLERANCE_PX) {
          cancel();
        }
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
    },
    wasLongPress: () => fired.current,
  };
}
