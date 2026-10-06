import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { addDays, format, isSameDay } from 'date-fns';
import type { Category, TimeEntry } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { formatDuration, formatTimeRange } from '../../lib/dates';
import { useLongPress } from '../../hooks/useLongPress';
import { useNow } from '../../hooks/useNow';
import { contextMenuPosition, type OpenEntryMenu } from './entryMenu';

type Props = {
  days: Date[];
  entries: TimeEntry[];
  categories: Map<string, Category>;
  onSelect: (entry: TimeEntry) => void;
  onOpenMenu: OpenEntryMenu;
};

export function ScheduleView({ days, entries, categories, onSelect, onOpenMenu }: Props) {
  const now = useNow();
  const groups = days
    .map((day) => ({
      day,
      entries: entries.filter((e) => new Date(e.start) < addDays(day, 1) && new Date(e.end) > day),
    }))
    .filter((group) => group.entries.length > 0);

  if (groups.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 3 }}>
        Nothing logged in these {days.length} days.
      </Typography>
    );
  }

  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: { xs: 1, sm: 2 }, overflowY: 'auto', flex: 1 }}>
      {groups.map(({ day, entries: dayEntries }) => {
        const today = isSameDay(day, now);
        return (
          <Box
            component="li"
            key={day.getTime()}
            sx={{ display: 'flex', gap: { xs: 1, sm: 3 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ width: { xs: 56, sm: 120 }, flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 22, lineHeight: 1, color: today ? 'primary.main' : 'text.primary' }}>
                {format(day, 'd')}
              </Typography>
              <Typography variant="caption" sx={{ color: today ? 'primary.main' : 'text.secondary' }}>
                {format(day, 'MMM, EEE').toUpperCase()}
              </Typography>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minWidth: 0 }}>
              {dayEntries.map((entry) => (
                <ScheduleItem
                  key={entry.id}
                  entry={entry}
                  color={(entry.categoryId && categories.get(entry.categoryId)?.appColor) || UNCATEGORISED_COLOR}
                  onSelect={onSelect}
                  onOpenMenu={onOpenMenu}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

type ItemProps = { entry: TimeEntry; color: string; onSelect: (entry: TimeEntry) => void; onOpenMenu: OpenEntryMenu };

function ScheduleItem({ entry, color, onSelect, onOpenMenu }: ItemProps) {
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  const longPress = useLongPress((position) => onOpenMenu(entry, position));
  return (
    <li>
      <ButtonBase
        {...longPress.handlers}
        data-entry-id={entry.id}
        onClick={() => !longPress.wasLongPress() && onSelect(entry)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!longPress.wasLongPress()) onOpenMenu(entry, contextMenuPosition(event));
        }}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 1.5,
          py: 0.75,
          px: 1,
          borderRadius: 1,
          textAlign: 'left',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ width: { xs: 120, sm: 150 }, flexShrink: 0, color: 'text.secondary' }}>
          {formatTimeRange(start, end)}
        </Typography>
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {entry.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {formatDuration(start, end)}
        </Typography>
      </ButtonBase>
    </li>
  );
}
