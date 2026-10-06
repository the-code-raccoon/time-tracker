import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { format, isSameDay } from 'date-fns';
import type { Category } from '../../shared/types';
import { usePreviousEntry } from '../hooks/data';
import { UNCATEGORISED_COLOR } from '../lib/color';
import { formatDuration, formatTime } from '../lib/dates';

type Props = {
  start: Date;
  categories: Category[];
  /** Moves the new entry's start to where the last one ended. */
  onStartFrom: (end: Date) => void;
};

/** TE-8: when creating an entry, shows when the last one before it ended. */
export function PreviousEntryHint({ start, categories, onStartFrom }: Props) {
  const { data: entry } = usePreviousEntry(start);
  if (!entry) return null;

  const end = new Date(entry.end);
  const color = categories.find((c) => c.id === entry.categoryId)?.appColor ?? UNCATEGORISED_COLOR;
  const when = isSameDay(end, start) ? formatTime(end) : `${format(end, 'EEE, MMM d')}, ${formatTime(end)}`;
  const gap =
    end < start ? `${formatDuration(end, start)} before` : end > start ? `overlaps by ${formatDuration(start, end)}` : 'right before';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minHeight: 30 }}>
      <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <span>
          Last entry: <Box component="strong" sx={{ color: 'text.primary', fontWeight: 500 }}>{entry.title}</Box>, ended {when} ({gap})
        </span>
      </Typography>
      {end.getTime() !== start.getTime() && (
        <Button size="small" onClick={() => onStartFrom(end)}>
          Start at {formatTime(end)}
        </Button>
      )}
    </Box>
  );
}
