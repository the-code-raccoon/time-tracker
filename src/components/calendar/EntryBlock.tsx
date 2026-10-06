import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { readableTextColor } from '../../lib/color';
import { formatTime, formatTimeRange } from '../../lib/dates';
import { MIN_VISUAL_MINUTES, type Positioned } from '../../lib/layout';
import type { TimeEntry } from '../../../shared/types';

type Props = {
  block: Positioned<TimeEntry>;
  color: string;
  pxPerMinute: number;
  onSelect: (entry: TimeEntry) => void;
};

export function EntryBlock({ block, color, pxPerMinute, onSelect }: Props) {
  const { item: entry, top, height, column, columns } = block;
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  const pixelHeight = Math.max(height, MIN_VISUAL_MINUTES) * pxPerMinute - 2;
  const twoLines = pixelHeight >= 34;

  return (
    <ButtonBase
      onClick={(event) => {
        event.stopPropagation();
        onSelect(entry);
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
        borderRadius: 1,
        outline: columns > 1 ? '1px solid' : 'none',
        outlineColor: 'background.default',
        px: 0.75,
        py: twoLines ? 0.25 : 0,
        overflow: 'hidden',
        display: 'block',
        textAlign: 'left',
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
    </ButtonBase>
  );
}
