import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Report } from '../../../shared/types';
import { dayMinutes, hatched, hourTicks, minutesLabel, type Series } from '../../lib/reports';

const HEIGHT = 240;
const MARGIN = { top: 8, right: 8, bottom: 24, left: 40 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
/** Width used before the chart has been measured (and in tests). */
const FALLBACK_WIDTH = 640;
const HATCH_ID = 'tt-uncategorised-hatch';

/** The uncategorised series ('') is hatched (see `hatched`). */
const fillOf = (s: Series) => (s.key === '' ? `url(#${HATCH_ID})` : s.color);

type Props = { days: Report['days']; series: Series[] };

/** A rect with only its top corners rounded (data end), square at the baseline. */
function roundedTop(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

/** REP-2: hours per day, stacked by category. Hover or focus a day for its breakdown. */
export function StackedDayChart({ days, series }: Props) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const columnRefs = useRef<(SVGRectElement | null)[]>([]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const totalWidth = width || FALLBACK_WIDTH;
  const plotWidth = totalWidth - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = plotWidth / days.length;
  const bar = Math.max(Math.min(MAX_BAR, slot * 0.6), 2);
  const totals = days.map((day) => series.reduce((sum, s) => sum + dayMinutes(day, series, s.key), 0));
  const ticks = hourTicks(Math.max(...totals, 0) / 60);
  const top = ticks.at(-1)! * 60;
  const y = (minutes: number) => (minutes / top) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotWidth / (days.length <= 7 ? 48 : 28)))));
  const dayFormat = days.length <= 7 ? 'EEE d' : 'd';

  function moveFocus(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const clamped = Math.min(Math.max(next, 0), days.length - 1);
    setFocusIndex(clamped);
    setActive(clamped);
    columnRefs.current[clamped]?.focus();
  }

  const describe = (index: number) => {
    const day = days[index];
    const parts = series
      .map((s) => [s.name, dayMinutes(day, series, s.key)] as const)
      .filter(([, minutes]) => minutes > 0)
      .map(([name, minutes]) => `${name} ${minutesLabel(minutes)}`);
    return `${format(parseISO(day.date), 'EEEE, MMMM d')}: ${minutesLabel(totals[index])}${parts.length ? `. ${parts.join(', ')}` : ''}`;
  };

  const tooltipDay = active !== null ? days[active] : null;
  const tooltipLeft = active !== null ? MARGIN.left + slot * (active + 0.5) : 0;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onPointerLeave={() => setActive(null)}>
      <svg width={totalWidth} height={HEIGHT} role="group" aria-label="Hours per day by category" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <pattern id={HATCH_ID} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={2} height={4} fill={series.find((s) => s.key === '')?.color ?? theme.palette.text.secondary} />
          </pattern>
        </defs>
        {/* Recessive hairline grid and y-axis labels. */}
        {ticks.map((tick) => (
          <g key={tick} transform={`translate(0, ${MARGIN.top + plotHeight - y(tick * 60)})`} aria-hidden>
            <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} stroke={theme.palette.divider} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={MARGIN.left - 8} dy="0.32em" textAnchor="end" fontSize={11} fill={theme.palette.text.secondary} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tick} h
            </text>
          </g>
        ))}

        {days.map((day, index) => {
          const x = MARGIN.left + slot * index;
          const barX = x + (slot - bar) / 2;
          let base = MARGIN.top + plotHeight;
          const segments = series
            .map((s) => ({ s, minutes: dayMinutes(day, series, s.key) }))
            .filter(({ minutes }) => minutes > 0);
          return (
            <g key={day.date}>
              {active === index && <rect x={x} y={MARGIN.top} width={slot} height={plotHeight} fill={theme.palette.action.hover} aria-hidden />}
              {segments.map(({ s, minutes }, i) => {
                const height = y(minutes);
                base -= height;
                // A 2px surface gap separates stacked segments; the top one has the rounded data end.
                const drawn = Math.max(height - (i > 0 ? GAP : 0), 0.5);
                const segmentY = base;
                return i === segments.length - 1 ? (
                  <path key={s.key} d={roundedTop(barX, segmentY, bar, drawn)} fill={fillOf(s)} aria-hidden />
                ) : (
                  <rect key={s.key} x={barX} y={segmentY} width={bar} height={drawn} fill={fillOf(s)} aria-hidden />
                );
              })}
              {index % labelEvery === 0 && (
                <text x={x + slot / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill={theme.palette.text.secondary} aria-hidden>
                  {format(parseISO(day.date), dayFormat)}
                </text>
              )}
              {/* The hit target is the whole day slot, not just the painted bar. */}
              <rect
                ref={(element) => {
                  columnRefs.current[index] = element;
                }}
                x={x}
                y={MARGIN.top}
                width={slot}
                height={plotHeight}
                fill="transparent"
                tabIndex={index === focusIndex ? 0 : -1}
                role="img"
                aria-label={describe(index)}
                onPointerEnter={() => setActive(index)}
                onFocus={() => {
                  setFocusIndex(index);
                  setActive(index);
                }}
                onBlur={() => setActive(null)}
                onKeyDown={(event) => moveFocus(event, index)}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left + plotWidth}
          y1={MARGIN.top + plotHeight}
          y2={MARGIN.top + plotHeight}
          stroke={theme.palette.text.secondary}
          strokeWidth={1}
          shapeRendering="crispEdges"
          aria-hidden
        />
      </svg>

      {tooltipDay && active !== null && (
        <Box
          role="tooltip"
          sx={{
            position: 'absolute',
            top: MARGIN.top,
            left: tooltipLeft,
            transform: tooltipLeft > totalWidth / 2 ? 'translateX(calc(-100% - 16px))' : 'translateX(16px)',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: 4,
            px: 1.5,
            py: 1,
            minWidth: 180,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" component="div">
            {format(parseISO(tooltipDay.date), 'EEE, MMM d')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {minutesLabel(totals[active])}
          </Typography>
          {series.map((s) => {
            const minutes = dayMinutes(tooltipDay, series, s.key);
            if (minutes <= 0) return null;
            return (
              <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12 }}>
                <Box sx={{ width: 12, height: s.key === '' ? 4 : 2, borderRadius: 1, background: s.key === '' ? hatched(s.color) : s.color, flexShrink: 0 }} />
                <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 72 }}>
                  {minutesLabel(minutes)}
                </Box>
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  {s.name}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
