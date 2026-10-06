import ArrowBack from '@mui/icons-material/ArrowBack';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Download from '@mui/icons-material/Download';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { useMemo, useState, type ReactNode } from 'react';
import type { Report } from '../../shared/types';
import { reportCsvUrl } from '../api';
import { DateField } from '../components/datetime/fields';
import { StackedDayChart } from '../components/reports/StackedDayChart';
import { useCategories, useReport } from '../hooks/data';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNow } from '../hooks/useNow';
import { UNCATEGORISED_COLOR } from '../lib/color';
import { dayMinutes, hatched, minutesLabel, presetRange, rangeLabel, seriesOf, shiftPreset, type ReportPreset, type Series } from '../lib/reports';

const CUSTOM_DEFAULT_DAYS = 30;

type Props = { onBack: () => void };

/** Legend/table key; uncategorised is hatched, as in the chart. */
function Swatch({ color, uncategorised = false }: { color: string; uncategorised?: boolean }) {
  return <Box sx={{ width: 10, height: 10, borderRadius: 0.5, background: uncategorised ? hatched(color) : color, flexShrink: 0 }} />;
}

function Stat({ label, value, caption }: { label: string; value: ReactNode; caption?: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, flex: '1 1 160px', minWidth: 0, bgcolor: 'transparent' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: { xs: 22, sm: 28 }, fontWeight: 600, lineHeight: 1.3 }} noWrap>
        {value}
      </Typography>
      {caption && (
        <Typography variant="caption" color="text.secondary" component="div">
          {caption}
        </Typography>
      )}
    </Paper>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 500, flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function DayTable({ days, series }: { days: Report['days']; series: Series[] }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Hours per day">
        <TableHead>
          <TableRow>
            <TableCell>Day</TableCell>
            {series.map((s) => (
              <TableCell key={s.key} align="right" sx={{ whiteSpace: 'nowrap' }}>
                {s.name}
              </TableCell>
            ))}
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {days.map((day) => {
            const values = series.map((s) => dayMinutes(day, series, s.key));
            return (
              <TableRow key={day.date}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{format(parseISO(day.date), 'EEE, MMM d')}</TableCell>
                {values.map((minutes, i) => (
                  <TableCell key={series[i].key} align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {minutes > 0 ? minutesLabel(minutes) : '—'}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {minutesLabel(values.reduce((a, b) => a + b, 0))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

/** §5.6: time per category over a day, week, month or custom range, a stacked chart per day, and CSV export. */
export function ReportsPage({ onBack }: Props) {
  const [preset, setPreset] = useState<ReportPreset>('week');
  const [date, setDate] = useState(() => new Date());
  const [custom, setCustom] = useState(() => ({ from: addDays(startOfDay(new Date()), -(CUSTOM_DEFAULT_DAYS - 1)), to: startOfDay(new Date()) }));
  const now = useNow();
  const [dayView, setDayView] = useState<'chart' | 'table'>('chart');
  useKeyboardShortcuts(true, { Escape: onBack });

  const range = preset === 'custom' ? { start: custom.from, end: addDays(custom.to, 1) } : presetRange(preset, date);
  const report = useReport(range.start, range.end);
  const categories = useCategories();
  const series = useMemo(
    () => (report.data ? seriesOf(report.data, categories.data ?? [], UNCATEGORISED_COLOR) : []),
    [report.data, categories.data],
  );
  const colorOf = (categoryId: string | null) =>
    series.find((s) => s.key === (categoryId ?? ''))?.color ?? categories.data?.find((c) => c.id === categoryId)?.appColor ?? UNCATEGORISED_COLOR;

  const total = series.reduce((sum, s) => sum + s.minutes, 0);
  const elapsedDays = report.data?.days.filter((day) => parseISO(day.date) <= now).length ?? 0;
  const label = rangeLabel(range, preset);
  const fileName = `${format(range.start, 'yyyy-MM-dd')}_${format(addDays(range.end, -1), 'yyyy-MM-dd')}`;

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Tooltip title="Back to calendar">
            <IconButton aria-label="Back to calendar" onClick={onBack} edge="start">
              <ArrowBack />
            </IconButton>
          </Tooltip>
          <Typography component="h1" variant="h6" sx={{ flex: 1 }}>
            Reports
          </Typography>
          <Button component="a" href={reportCsvUrl(range.start, range.end, fileName)} download startIcon={<Download />} color="inherit">
            Export CSV
          </Button>
        </Toolbar>
      </AppBar>

      <Stack component="main" spacing={3} sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 1.5, sm: 3 }, opacity: report.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
        {/* Filters: one row, above everything they scope. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={preset}
            onChange={(_, next: ReportPreset | null) => next && setPreset(next)}
            aria-label="Range"
          >
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>
          {preset === 'custom' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DateField ariaLabel="From" value={custom.from} onChange={(from) => setCustom((c) => ({ from, to: from > c.to ? from : c.to }))} />
              <Typography variant="body2" color="text.secondary">
                to
              </Typography>
              <DateField ariaLabel="To" value={custom.to} onChange={(to) => setCustom((c) => ({ from: to < c.from ? to : c.from, to }))} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button variant="outlined" color="inherit" size="small" onClick={() => setDate(new Date())} sx={{ borderColor: 'divider' }}>
                Today
              </Button>
              <IconButton aria-label={`Previous ${preset}`} onClick={() => setDate((d) => shiftPreset(preset, d, -1))} size="small">
                <ChevronLeft />
              </IconButton>
              <IconButton aria-label={`Next ${preset}`} onClick={() => setDate((d) => shiftPreset(preset, d, 1))} size="small">
                <ChevronRight />
              </IconButton>
            </Box>
          )}
          <Typography component="p" variant="subtitle1" aria-live="polite">
            {label}
          </Typography>
        </Box>

        {report.isError && <Alert severity="error">Couldn't load the report: {report.error.message}</Alert>}

        {report.data && total === 0 && <Typography color="text.secondary">Nothing logged in this range.</Typography>}

        {report.data && total > 0 && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <Stat label="Logged" value={minutesLabel(total)} caption="Overlapping entries each count in full" />
              {report.data.days.length > 1 && elapsedDays > 0 && (
                <Stat label="Daily average" value={minutesLabel(total / elapsedDays)} caption={`Over ${elapsedDays} day${elapsedDays === 1 ? '' : 's'}`} />
              )}
              <Stat
                label="Most time"
                value={[...series].sort((a, b) => b.minutes - a.minutes)[0].name}
                caption={minutesLabel(Math.max(...series.map((s) => s.minutes)))}
              />
            </Box>

            {report.data.days.length > 1 && (
              <Section
                title="Hours per day"
                action={
                  <ToggleButtonGroup exclusive size="small" value={dayView} onChange={(_, next) => next && setDayView(next)} aria-label="Show as">
                    <ToggleButton value="chart">Chart</ToggleButton>
                    <ToggleButton value="table">Table</ToggleButton>
                  </ToggleButtonGroup>
                }
              >
                {dayView === 'chart' ? (
                  <>
                    <Box component="ul" aria-label="Legend" sx={{ listStyle: 'none', m: 0, p: 0, mb: 1.5, display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
                      {series.map((s) => (
                        <Box component="li" key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}>
                          <Swatch color={s.color} uncategorised={s.key === ''} />
                          {s.name}
                        </Box>
                      ))}
                    </Box>
                    <StackedDayChart days={report.data.days} series={series} />
                  </>
                ) : (
                  <DayTable days={report.data.days} series={series} />
                )}
              </Section>
            )}

            <Section title="By category">
              <Table size="small" aria-label="Time by category">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Time</TableCell>
                    <TableCell align="right">Share</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      Entries
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...series]
                    .sort((a, b) => b.minutes - a.minutes)
                    .map((s) => (
                      <TableRow key={s.key}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Swatch color={s.color} uncategorised={s.key === ''} />
                            {s.name}
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {minutesLabel(s.minutes)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round((s.minutes / total) * 100)}%
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', display: { xs: 'none', sm: 'table-cell' } }}>
                          {s.entries}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Section>

            <Section title="Top activities">
              <Table size="small" aria-label="Top activities">
                <TableHead>
                  <TableRow>
                    <TableCell>Activity</TableCell>
                    <TableCell align="right">Time</TableCell>
                    <TableCell align="right">Entries</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.data.activities.map((activity) => (
                    <TableRow key={activity.title}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Swatch color={colorOf(activity.categoryId)} uncategorised={activity.categoryId === null} />
                          {activity.title}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {minutesLabel(activity.minutes)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {activity.entries}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </>
        )}
      </Stack>
    </Box>
  );
}
