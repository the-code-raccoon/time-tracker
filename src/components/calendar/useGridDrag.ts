import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { TimeEntry } from '../../../shared/types';
import { createTimes, moveTimes, resizeTimes, sameTimes, type Times } from '../../lib/drag';

export type DragKind = 'move' | 'resize' | 'create';

/** What's being dragged, for drawing the preview. */
export type DragPreview = Times & { kind: DragKind; entry?: TimeEntry };

/** DRAG-6: a press that moves less than this is a click. */
const CLICK_TOLERANCE_PX = 4;
/** DRAG-8: touch must be held this long before it drags; moving further than the tolerance first is a scroll. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCE_PX = 10;
/** DRAG-7: dragging within this distance of the grid's top or bottom edge scrolls it. */
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_PX = 16;

type Session = {
  kind: DragKind;
  entry?: TimeEntry;
  pointerId: number;
  touch: boolean;
  originX: number;
  originY: number;
  originMinute: number;
  originDay: number;
  x: number;
  y: number;
  /** Mouse: straight away. Touch: after the long press. */
  armed: boolean;
  /** Moved past the click tolerance: now a drag. */
  active: boolean;
  cancelled: boolean;
  preview?: Times;
  longPress?: ReturnType<typeof setTimeout>;
  frame?: number;
  cleanup: () => void;
};

type Options = {
  /** The element holding the hour gutter and the day columns (it scrolls with them). */
  gridRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  gutterWidth: number;
  pxPerMinute: number;
  days: Date[];
  onCommit: (entry: TimeEntry, times: Times, kind: 'move' | 'resize') => void;
  onCreate: (times: Times) => void;
  /** DRAG-8: long-press and lift without moving. */
  onLongPress: (entry: TimeEntry, position: { x: number; y: number }) => void;
};

/** Swallows the click that the browser sends after a drag or a long press ends. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

/** §5.2d: move, resize and drag-to-create in the Day and Week time grids. */
export function useGridDrag(options: Options) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const session = useRef<Session | null>(null);
  // Handlers registered on window read the latest props through this ref.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => () => session.current?.cleanup(), []);

  function locate(x: number, y: number) {
    const { gridRef, gutterWidth, pxPerMinute, days } = latest.current;
    const rect = gridRef.current!.getBoundingClientRect();
    const columnWidth = (rect.width - gutterWidth) / days.length;
    const day = Math.floor((x - rect.left - gutterWidth) / columnWidth);
    return { minute: (y - rect.top) / pxPerMinute, day: Math.min(Math.max(day, 0), days.length - 1) };
  }

  function computePreview(s: Session): Times {
    const { minute, day } = locate(s.x, s.y);
    if (s.kind === 'create') return createTimes(latest.current.days[s.originDay], s.originMinute, minute);
    if (s.kind === 'resize') return resizeTimes(s.entry!, minute - s.originMinute);
    return moveTimes(s.entry!, minute - s.originMinute, day - s.originDay);
  }

  function update(s: Session) {
    s.preview = computePreview(s);
    setPreview({ kind: s.kind, entry: s.entry, ...s.preview });
  }

  function autoScroll(s: Session) {
    const scroller = latest.current.scrollRef.current;
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const above = rect.top + AUTO_SCROLL_EDGE_PX - s.y;
      const below = s.y - (rect.bottom - AUTO_SCROLL_EDGE_PX);
      const speed = (distance: number) => Math.ceil((Math.min(distance, AUTO_SCROLL_EDGE_PX) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX);
      const delta = above > 0 ? -speed(above) : below > 0 ? speed(below) : 0;
      if (delta !== 0) {
        scroller.scrollTop += delta;
        update(s);
      }
    }
    s.frame = requestAnimationFrame(() => autoScroll(s));
  }

  function activate(s: Session) {
    s.active = true;
    document.body.style.cursor = s.kind === 'resize' ? 'ns-resize' : s.kind === 'move' ? 'grabbing' : '';
    update(s);
    s.frame = requestAnimationFrame(() => autoScroll(s));
  }

  function finish(s: Session) {
    s.cleanup();
    session.current = null;
    document.body.style.cursor = '';
  }

  function begin(event: PointerEvent, kind: DragKind, originDay: number, entry?: TimeEntry) {
    session.current?.cleanup();
    const touch = event.pointerType === 'touch';
    const { minute } = locate(event.clientX, event.clientY);

    const onMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== s.pointerId || s.cancelled) return;
      s.x = e.clientX;
      s.y = e.clientY;
      const distance = Math.hypot(s.x - s.originX, s.y - s.originY);
      if (!s.armed) {
        // Touch moved before the long press: the user is scrolling.
        if (distance > LONG_PRESS_TOLERANCE_PX) finish(s);
        return;
      }
      if (!s.active && distance >= CLICK_TOLERANCE_PX) activate(s);
      else if (s.active) update(s);
    };

    const onUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      finish(s);
      if (s.cancelled) {
        swallowNextClick();
      } else if (s.active && s.preview) {
        swallowNextClick();
        if (s.kind === 'create') {
          setPreview(null);
          latest.current.onCreate(s.preview);
          return;
        }
        if (!sameTimes(s.preview, s.entry!)) latest.current.onCommit(s.entry!, s.preview, s.kind);
        // The commit puts the new times in the query cache, which re-renders on the next task. Clearing the preview
        // in a task queued after that one keeps the entry from flashing back to where it was.
        setTimeout(() => setPreview(null), 0);
        return;
      } else if (s.touch && s.armed && s.entry) {
        swallowNextClick();
        latest.current.onLongPress(s.entry, { x: s.originX, y: s.originY });
      }
      setPreview(null);
    };

    const onCancel = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      finish(s);
      setPreview(null);
    };

    // DRAG-6: Escape puts the entry back. The pointer is still down, so wait for it to come up.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !s.active) return;
      e.preventDefault();
      e.stopPropagation();
      s.cancelled = true;
      cancelAnimationFrame(s.frame ?? 0);
      document.body.style.cursor = '';
      setPreview(null);
    };

    // Once a touch drag is armed, stop the browser from scrolling instead.
    const onTouchMove = (e: TouchEvent) => {
      if (s.armed && e.cancelable) e.preventDefault();
    };

    const s: Session = {
      kind,
      entry,
      pointerId: event.pointerId,
      touch,
      originX: event.clientX,
      originY: event.clientY,
      originMinute: minute,
      originDay,
      x: event.clientX,
      y: event.clientY,
      armed: !touch,
      active: false,
      cancelled: false,
      cleanup: () => {
        clearTimeout(s.longPress);
        cancelAnimationFrame(s.frame ?? 0);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('touchmove', onTouchMove);
      },
    };
    if (touch) {
      s.longPress = setTimeout(() => {
        s.armed = true;
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    session.current = s;
  }

  return {
    preview,
    /** Pointer down on an entry block: move it, or resize it from its bottom edge. */
    onEntryPointerDown(event: PointerEvent, entry: TimeEntry, dayIndex: number, kind: 'move' | 'resize') {
      if (event.button !== 0 || event.ctrlKey) return;
      begin(event, kind, dayIndex, entry);
    },
    /** Pointer down on empty grid space: drag to select a range (mouse and pen; a touch swipe scrolls). */
    onColumnPointerDown(event: PointerEvent, dayIndex: number) {
      if (event.button !== 0 || event.pointerType === 'touch' || event.target !== event.currentTarget) return;
      begin(event, 'create', dayIndex);
    },
    /** A touch is held on an entry: its long press is handled on lift, so ignore the browser's contextmenu event. */
    touchPressActive: () => !!session.current?.touch,
  };
}
