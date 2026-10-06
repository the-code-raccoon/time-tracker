import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { PointerEvent } from 'react';
import { readableTextColor } from '../../lib/color';
import { formatTime, formatTimeRange } from '../../lib/dates';
import { MIN_VISUAL_MINUTES, type Positioned } from '../../lib/layout';
import type { TimeEntry } from '../../../shared/types';
import { contextMenuPosition, type OpenEntryMenu } from './entryMenu';

/** Height of the strip at the bottom of a block that resizes it (DRAG-3). */
const RESIZE_HANDLE_PX = 6;

type Props = {
  block: Positioned<TimeEntry>;
  color: string;
  pxPerMinute: number;
  onSelect: (entry: TimeEntry) => void;
  onOpenMenu: OpenEntryMenu;
  onDragStart: (event: PointerEvent, kind: 'move' | 'resize') => void;
  /** A touch is being held: the long press is handled when it lifts (DRAG-8). */
  touchPressActive: () => boolean;
  /** The original stays in place, dimmed, while it's dragged (DRAG-1). */
  dimmed?: boolean;
};

export function EntryBlock({ block, color, pxPerMinute, onSelect, onOpenMenu, onDragStart, touchPressActive, dimmed }: Props) {
  const { item: entry, top, height, column, columns, continuesAfter } = block;
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  const pixelHeight = Math.max(height, MIN_VISUAL_MINUTES) * pxPerMinute - 2;
  const twoLines = pixelHeight >= 34;

  return (
    <ButtonBase
      // No ripple: it would show on the original while it's dragged (Google Calendar has none either).
      disableRipple
      data-entry-id={entry.id}
      onPointerDown={(event) => {
        const resize = (event.target as HTMLElement).closest('[data-resize-handle]') !== null;
        onDragStart(event, resize ? 'resize' : 'move');
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entry);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!touchPressActive()) onOpenMenu(entry, contextMenuPosition(event));
      }}
      aria-label={`${entry.title}, ${formatTimeRange(start, end)}`}
      title={`${entry.title}\n${formatTimeRange(start, end)}`}
      sx={{
        position: 'absolute',
        top: top * pxPerMinute + 1,
        height: pixelHeight,
        left: `calc(${(column / columns) * 100}% + 1px)`,
        width: `calc(${100 / columns}% - 4px)`,
        bgcolor: color,
        color: readableTextColor(color),
        opacity: dimmed ? 0.4 : 1,
        borderRadius: 1,
        outline: columns > 1 ? '1px solid' : 'none',
        outlineColor: 'background.default',
        px: 0.75,
        py: twoLines ? 0.25 : 0,
        overflow: 'hidden',
        display: 'block',
        textAlign: 'left',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', zIndex: 2 },
      }}
    >
      {twoLines ? (
        <>
          <Typography variant="caption" component="div" noWrap sx={{ fontWeight: 500, lineHeight: 1.3 }}>
            {entry.title}
          </Typography>
          <Typography variant="caption" component="div" noWrap sx={{ lineHeight: 1.3, opacity: 0.9 }}>
            {formatTimeRange(start, end)}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" component="div" noWrap sx={{ lineHeight: `${pixelHeight}px`, fontSize: pixelHeight < 14 ? 10 : undefined }}>
          <strong>{entry.title}</strong>, {formatTime(start)}
        </Typography>
      )}
      {/* The end is on this day only if the entry doesn't continue into the next one. */}
      {!continuesAfter && (
        <Box
          data-resize-handle
          aria-hidden
          sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.min(RESIZE_HANDLE_PX, pixelHeight / 3), cursor: 'ns-resize' }}
        />
      )}
    </ButtonBase>
  );
}
