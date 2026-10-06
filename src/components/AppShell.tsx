import Add from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { addMinutes } from 'date-fns';
import { useMemo, useState } from 'react';
import type { Category, TimeEntry } from '../../shared/types';
import { useCategories, useEntries, useEntryMutations, useTitles } from '../hooks/data';
import { daysBetween, rangeTitle, shiftDate, snapMinutes, viewRange, type ViewMode } from '../lib/dates';
import { CalendarToolbar } from './calendar/CalendarToolbar';
import { ScheduleView } from './calendar/ScheduleView';
import { TimeGrid } from './calendar/TimeGrid';
import { EntryDialog, type EntryDraft } from './EntryDialog';

const DEFAULT_DURATION_MINUTES = 30;

type Props = { onLogout: () => void };

export function AppShell({ onLogout }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const [view, setView] = useState<ViewMode>(() => (compact ? 'day' : 'week'));
  const [date, setDate] = useState(() => new Date());
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { start, end } = viewRange(view, date);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const days = useMemo(() => daysBetween(new Date(startMs), new Date(endMs)), [startMs, endMs]);
  const entries = useEntries(start, end);
  const categories = useCategories();
  const titles = useTitles();
  const mutations = useEntryMutations();

  const categoryMap = useMemo(
    () => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  function openCreate(at: Date = snapMinutes(new Date(), 5)) {
    setDraft({ kind: 'create', start: at, end: addMinutes(at, DEFAULT_DURATION_MINUTES) });
  }

  function openEdit(entry: TimeEntry) {
    setDraft({ kind: 'edit', entry });
  }

  const editing = draft?.kind === 'edit' ? draft.entry : undefined;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <CalendarToolbar
          title={rangeTitle(view, date)}
          view={view}
          compact={compact}
          onViewChange={setView}
          onToday={() => setDate(new Date())}
          onPrevious={() => setDate((d) => shiftDate(view, d, -1))}
          onNext={() => setDate((d) => shiftDate(view, d, 1))}
          onCreate={() => openCreate()}
          onLogout={onLogout}
        />
        <Box sx={{ height: 2 }}>{entries.isFetching && <LinearProgress sx={{ height: 2 }} />}</Box>
      </AppBar>

      {entries.isError && (
        <Alert
          severity="error"
          sx={{ m: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => void entries.refetch()}>
              Retry
            </Button>
          }
        >
          Couldn't load entries: {entries.error.message}
        </Alert>
      )}

      <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {view === 'schedule' ? (
          <ScheduleView days={days} entries={entries.data ?? []} categories={categoryMap} onSelect={openEdit} />
        ) : (
          <TimeGrid
            days={days}
            entries={entries.data ?? []}
            categories={categoryMap}
            onCreateAt={openCreate}
            onSelect={openEdit}
            onDayClick={(day) => {
              setDate(day);
              setView('day');
            }}
          />
        )}
      </Box>

      {compact && (
        <Fab color="primary" aria-label="Create entry" onClick={() => openCreate()} sx={{ position: 'fixed', right: 16, bottom: 16 }}>
          <Add />
        </Fab>
      )}

      {draft && (
        <EntryDialog
          key={editing?.id ?? 'new'}
          draft={draft}
          categories={categories.data ?? []}
          titles={titles.data ?? []}
          onClose={() => setDraft(null)}
          onSubmit={async (input) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, patch: input });
            else await mutations.create.mutateAsync(input);
            setMessage(editing ? 'Entry updated' : 'Entry created');
          }}
          onDelete={
            editing
              ? async () => {
                  await mutations.remove.mutateAsync(editing.id);
                  setMessage('Entry deleted');
                }
              : undefined
          }
        />
      )}

      <Snackbar open={!!message} autoHideDuration={3000} onClose={() => setMessage(null)} message={message} />
    </Box>
  );
}
