import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { useState } from 'react';
import { useNow } from '../../hooks/useNow';

type Props = { selected: Date; onSelect: (day: Date) => void };

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Google Calendar's month popup: Sunday-first weeks, 6 rows, neighbouring months dimmed. */
export function MonthCalendar({ selected, onSelect }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const first = startOfWeek(month, { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const today = useNow();

  return (
    <Box sx={{ p: 2, width: 300 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography sx={{ flex: 1, fontWeight: 500, pl: 1 }} aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </Typography>
        <IconButton size="small" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight fontSize="small" />
        </IconButton>
      </Box>
      <Box role="grid" aria-label={format(month, 'MMMM yyyy')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 0.5 }}>
        {WEEKDAYS.map((day, i) => (
          <Typography key={i} variant="caption" sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 500, py: 0.5 }}>
            {day}
          </Typography>
        ))}
        {days.map((day) => {
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <ButtonBase
              key={day.getTime()}
              onClick={() => onSelect(day)}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              aria-pressed={isSelected}
              sx={{
                justifySelf: 'center',
                width: 32,
                height: 32,
                borderRadius: '50%',
                fontSize: 12,
                fontWeight: 500,
                color: isSelected
                  ? 'primary.contrastText'
                  : isToday
                    ? 'primary.main'
                    : isSameMonth(day, month)
                      ? 'text.primary'
                      : 'text.disabled',
                bgcolor: isSelected ? 'primary.main' : undefined,
                '&:hover': { bgcolor: isSelected ? 'primary.main' : 'action.hover' },
              }}
            >
              {format(day, 'd')}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
