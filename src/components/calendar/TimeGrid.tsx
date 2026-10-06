import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { addMinutes, format, isSameDay } from 'date-fns';
import { useEffect, useRef, type MouseEvent } from 'react';
import type { Category, TimeEntry } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { layoutDay } from '../../lib/layout';
import { useNow } from '../../hooks/useNow';
import { EntryBlock } from './EntryBlock';

export const HOUR_HEIGHT = 48;
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
const GUTTER = 56;
const CLICK_SNAP_MINUTES = 15;

type Props = {
  days: Date[];
  entries: TimeEntry[];
  categories: Map<string, Category>;
  onCreateAt: (start: Date) => void;
  onSelect: (entry: TimeEntry) => void;
  onDayClick: (day: Date) => void;
};

export function TimeGrid({ days, entries, categories, onCreateAt, onSelect, onDayClick }: Props) {
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);

  // When the visible days change, scroll to ~2 h before now (if today is visible) or to 7 am.
  useEffect(() => {
    const current = new Date();
    const minutes = days.some((day) => isSameDay(day, current))
      ? current.getHours() * 60 + current.getMinutes() - 120
      : 7 * 60;
    scrollRef.current?.scrollTo?.({ top: Math.max(0, minutes * PX_PER_MINUTE) });
  }, [days]);

  function handleColumnClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = Math.floor(offset / PX_PER_MINUTE / CLICK_SNAP_MINUTES) * CLICK_SNAP_MINUTES;
    onCreateAt(addMinutes(day, Math.min(Math.max(minutes, 0), 24 * 60 - CLICK_SNAP_MINUTES)));
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ display: 'flex', borderBottom: 1, borderColor: 'divider', overflowY: 'hidden', scrollbarGutter: 'stable' }}>
        <Box sx={{ width: GUTTER, flexShrink: 0 }} />
        {days.map((day) => {
          const today = isSameDay(day, now);
          return (
            <ButtonBase
              key={day.getTime()}
              onClick={() => onDayClick(day)}
              aria-label={format(day, 'EEEE, MMMM d')}
              sx={{ flex: 1, minWidth: 0, flexDirection: 'column', py: 1, borderRadius: 2 }}
            >
              <Typography variant="caption" sx={{ color: today ? 'primary.main' : 'text.secondary', fontWeight: 500 }}>
                {format(day, 'EEE').toUpperCase()}
              </Typography>
              <Box
                sx={{
                  width: { xs: 32, sm: 44 },
                  height: { xs: 32, sm: 44 },
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: { xs: 16, sm: 24 },
                  bgcolor: today ? 'primary.main' : 'transparent',
                  color: today ? 'primary.contrastText' : 'text.primary',
                }}
              >
                {format(day, 'd')}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable' }}>
        <Box sx={{ display: 'flex', position: 'relative', height: 24 * HOUR_HEIGHT }}>
          <Box sx={{ width: GUTTER, flexShrink: 0, position: 'relative' }} aria-hidden>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <Typography
                key={hour}
                variant="caption"
                sx={{ position: 'absolute', top: hour * HOUR_HEIGHT - 8, right: 8, color: 'text.secondary', fontSize: 10 }}
              >
                {format(new Date(2000, 0, 1, hour), 'h a')}
              </Typography>
            ))}
          </Box>

          {days.map((day) => (
            <Box
              key={day.getTime()}
              data-testid={`day-column-${format(day, 'yyyy-MM-dd')}`}
              onClick={(event) => handleColumnClick(day, event)}
              sx={{
                flex: 1,
                minWidth: 0,
                position: 'relative',
                borderLeft: 1,
                borderColor: 'divider',
                cursor: 'pointer',
                backgroundImage: (theme) =>
                  `repeating-linear-gradient(to bottom, ${theme.palette.divider} 0 1px, transparent 1px ${HOUR_HEIGHT}px)`,
              }}
            >
              {layoutDay(entries, day).map((block) => (
                <EntryBlock
                  key={block.item.id}
                  block={block}
                  color={(block.item.categoryId && categories.get(block.item.categoryId)?.appColor) || UNCATEGORISED_COLOR}
                  pxPerMinute={PX_PER_MINUTE}
                  onSelect={onSelect}
                />
              ))}
              {isSameDay(day, now) && (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (now.getHours() * 60 + now.getMinutes()) * PX_PER_MINUTE,
                    borderTop: '2px solid #ea4335',
                    zIndex: 3,
                    pointerEvents: 'none',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: -6,
                      top: -7,
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: '#ea4335',
                    },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
