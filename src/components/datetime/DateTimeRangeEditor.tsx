import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { isSameDay } from 'date-fns';
import { useNow } from '../../hooks/useNow';
import { timeZoneLabel } from '../../lib/timezone';
import { minutesOfDay } from '../../lib/parse';
import {
  isValidRange,
  setDuration,
  setEndDate,
  setEndTime,
  setStartDate,
  setStartTime,
  type TimeRange,
} from '../../lib/timeRange';
import { DateField, DurationField, EndTimeField, TimeField } from './fields';

type Props = { range: TimeRange; onChange: (range: TimeRange) => void };

/** Google Calendar's "[date] [time] to [time] [date]" row, plus a duration control (§5.2b). */
export function DateTimeRangeEditor({ range, onChange }: Props) {
  const { start, end } = range;
  const now = useNow();
  const invalid = !isValidRange(range);
  const durationMinutes = invalid ? null : Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <DateField ariaLabel="Start date" value={start} onChange={(day) => onChange(setStartDate(range, day))} />
          <TimeField
            ariaLabel="Start time"
            value={start}
            referenceMinutes={minutesOfDay(now)}
            onChange={(minutes) => onChange(setStartTime(range, minutes))}
          />
        </Box>
        <Typography variant="body2" color="text.secondary">
          to
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <EndTimeField
            ariaLabel="End time"
            start={start}
            end={end}
            error={invalid}
            referenceMinutes={isSameDay(start, end) ? minutesOfDay(start) : 0}
            onChangeTime={(minutes) => onChange(setEndTime(range, minutes))}
            onChangeDuration={(minutes) => onChange(setDuration(range, minutes))}
          />
          <DateField ariaLabel="End date" value={end} error={invalid} onChange={(day) => onChange(setEndDate(range, day))} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Duration
        </Typography>
        <DurationField minutes={durationMinutes} onChange={(minutes) => onChange(setDuration(range, minutes))} />
        <Typography variant="caption" color="text.secondary">
          {timeZoneLabel(start)}
        </Typography>
      </Box>
      {invalid && (
        <Typography role="alert" variant="caption" sx={{ color: '#f2b8b5', display: 'block', mt: 1 }}>
          The end must be after the start.
        </Typography>
      )}
    </Box>
  );
}
