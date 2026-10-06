import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { addDays, format, isSameDay, isSameMonth } from 'date-fns';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Category, TimeEntry } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { formatTime, formatTimeRange } from '../../lib/dates';
import { useLongPress } from '../../hooks/useLongPress';
import { useNow } from '../../hooks/useNow';
import { contextMenuPosition, type OpenEntryMenu } from './entryMenu';

const ITEM_HEIGHT = 20;
const ITEM_GAP = 1;
const CELL_HEADER = 28;
/** Entries per day shown before the grid has been measured (and in tests, where nothing has a size). */
const FALLBACK_CAPACITY = 4;

type Props = {
  /** The month being shown (days outside it are dimmed). */
  month: Date;
  /** Whole weeks, Sunday first. */
  days: Date[];
  entries: TimeEntry[];
  categories: Map<string, Category>;
  onSelect: (entry: TimeEntry) => void;
  onOpenMenu: OpenEntryMenu;
  onDayClick: (day: Date) => void;
  onCreateOn: (day: Date) => void;
};

/** Entries overlapping a local day, in start order (an entry crossing midnight is listed on both days). */
const entriesOn = (entries: TimeEntry[], day: Date) =>
  entries.filter((e) => new Date(e.start) < addDays(day, 1) && new Date(e.end) > day);

/** TE-2: Google Calendar's month grid. Each day lists its entries; the ones that don't fit are behind "N more". */
export function MonthView({ month, days, entries, categories, onSelect, onOpenMenu, onDayClick, onCreateOn }: Props) {
  const now = useNow();
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(0);
  const [overflow, setOverflow] = useState<{ day: Date; anchor: HTMLElement } | null>(null);
  const weeks = days.length / 7;

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => setGridHeight(item.contentRect.height));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const cellHeight = gridHeight / weeks;
  const capacity = gridHeight > 0 ? Math.max(Math.floor((cellHeight - CELL_HEADER) / (ITEM_HEIGHT + ITEM_GAP)), 1) : FALLBACK_CAPACITY;
  const colorOf = (entry: TimeEntry) => (entry.categoryId && categories.get(entry.categoryId)?.appColor) || UNCATEGORISED_COLOR;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: 1, borderColor: 'divider' }}>
        {days.slice(0, 7).map((day) => (
          <Typography key={day.getTime()} variant="caption" sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 500, py: 0.5 }}>
            {format(day, 'EEE').toUpperCase()}
          </Typography>
        ))}
      </Box>
      <Box
        ref={gridRef}
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))`,
        }}
      >
        {days.map((day) => {
          const dayEntries = entriesOn(entries, day);
          const fits = dayEntries.length <= capacity;
          const shown = fits ? dayEntries : dayEntries.slice(0, Math.max(capacity - 1, 0));
          const hidden = dayEntries.length - shown.length;
          const today = isSameDay(day, now);
          return (
            <Box
              key={day.getTime()}
              data-testid={`month-day-${format(day, 'yyyy-MM-dd')}`}
              onClick={(event: MouseEvent) => event.target === event.currentTarget && onCreateOn(day)}
              sx={{
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
                borderRight: 1,
                borderBottom: 1,
                borderColor: 'divider',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: `${ITEM_GAP}px`,
                pb: 0.5,
              }}
            >
              <ButtonBase
                onClick={() => onDayClick(day)}
                aria-label={format(day, 'EEEE, MMMM d')}
                aria-current={today ? 'date' : undefined}
                sx={{
                  alignSelf: 'center',
                  flexShrink: 0,
                  mt: 0.5,
                  minWidth: 24,
                  height: 24,
                  px: 0.5,
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  bgcolor: today ? 'primary.main' : undefined,
                  color: today ? 'primary.contrastText' : isSameMonth(day, month) ? 'text.primary' : 'text.disabled',
                  '&:hover': { bgcolor: today ? 'primary.main' : 'action.hover' },
                }}
              >
                {day.getDate() === 1 ? format(day, 'MMM d') : format(day, 'd')}
              </ButtonBase>
              {shown.map((entry) => (
                <MonthItem key={entry.id} entry={entry} day={day} color={colorOf(entry)} onSelect={onSelect} onOpenMenu={onOpenMenu} />
              ))}
              {hidden > 0 && (
                <ButtonBase
                  onClick={(event) => setOverflow({ day, anchor: event.currentTarget })}
                  sx={{ mx: 0.5, px: 0.75, height: ITEM_HEIGHT, flexShrink: 0, justifyContent: 'flex-start', borderRadius: 1, fontSize: 12, fontWeight: 500, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  {hidden} more
                </ButtonBase>
              )}
            </Box>
          );
        })}
      </Box>

      <Popover
        open={!!overflow}
        anchorEl={overflow?.anchor}
        onClose={() => setOverflow(null)}
        anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
        transformOrigin={{ vertical: 'center', horizontal: 'center' }}
        slotProps={{ paper: { sx: { width: 240, maxHeight: '70vh', p: 1 } } }}
      >
        {overflow && (
          <Box role="dialog" aria-label={format(overflow.day, 'EEEE, MMMM d')}>
            <Box sx={{ textAlign: 'center', mb: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, display: 'block' }}>
                {format(overflow.day, 'EEE').toUpperCase()}
              </Typography>
              <ButtonBase
                onClick={() => {
                  setOverflow(null);
                  onDayClick(overflow.day);
                }}
                aria-label={`Open ${format(overflow.day, 'EEEE, MMMM d')}`}
                sx={{ width: 44, height: 44, borderRadius: '50%', fontSize: 24, '&:hover': { bgcolor: 'action.hover' } }}
              >
                {format(overflow.day, 'd')}
              </ButtonBase>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${ITEM_GAP}px` }}>
              {entriesOn(entries, overflow.day).map((entry) => (
                <MonthItem
                  key={entry.id}
                  entry={entry}
                  day={overflow.day}
                  color={colorOf(entry)}
                  onSelect={(e) => {
                    setOverflow(null);
                    onSelect(e);
                  }}
                  onOpenMenu={onOpenMenu}
                />
              ))}
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  );
}

type ItemProps = { entry: TimeEntry; day: Date; color: string; onSelect: (entry: TimeEntry) => void; onOpenMenu: OpenEntryMenu };

function MonthItem({ entry, day, color, onSelect, onOpenMenu }: ItemProps) {
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  const longPress = useLongPress((position) => onOpenMenu(entry, position));
  // An entry that started the day before shows when it ends instead.
  const time = start >= day ? formatTime(start) : `until ${formatTime(end)}`;
  return (
    <ButtonBase
      {...longPress.handlers}
      data-entry-id={entry.id}
      onClick={() => !longPress.wasLongPress() && onSelect(entry)}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!longPress.wasLongPress()) onOpenMenu(entry, contextMenuPosition(event));
      }}
      aria-label={`${entry.title}, ${formatTimeRange(start, end)}`}
      title={`${entry.title}\n${formatTimeRange(start, end)}`}
      sx={{
        mx: 0.5,
        px: 0.5,
        height: ITEM_HEIGHT,
        flexShrink: 0,
        gap: 0.5,
        justifyContent: 'flex-start',
        borderRadius: 1,
        fontSize: 12,
        minWidth: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
      }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0, display: { xs: 'none', md: 'inline' } }}>
        {time}
      </Box>
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
        {entry.title}
      </Box>
    </ButtonBase>
  );
}
