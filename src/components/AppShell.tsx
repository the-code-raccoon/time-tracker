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
import { ApiError } from '../api';
import { useCategories, useEntries, useEntryMutations, useGoogleStatus, useSync, useTitles } from '../hooks/data';
import { formatSyncSummary } from '../lib/sync';
import { daysBetween, rangeTitle, shiftDate, snapMinutes, viewRange, type ViewMode } from '../lib/dates';
import { CalendarToolbar } from './calendar/CalendarToolbar';
import { ScheduleView } from './calendar/ScheduleView';
import { TimeGrid } from './calendar/TimeGrid';
import { EntryContextMenu, type ContextMenuState } from './EntryContextMenu';
import { EntryDialog, type EntryDraft } from './EntryDialog';
import { ReconcileDialog } from './ReconcileDialog';

const DEFAULT_DURATION_MINUTES = 30;

type Notice = { text: string; undo?: () => void; action?: { label: string; run: () => void } };

type Props = { onOpenSettings: () => void; onLogout: () => void };

export function AppShell({ onOpenSettings, onLogout }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const [view, setView] = useState<ViewMode>(() => (compact ? 'day' : 'week'));
  const [date, setDate] = useState(() => new Date());
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const { start, end } = viewRange(view, date);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const days = useMemo(() => daysBetween(new Date(startMs), new Date(endMs)), [startMs, endMs]);
  const entries = useEntries(start, end);
  const categories = useCategories();
  const titles = useTitles();
  const mutations = useEntryMutations();
  const syncMutation = useSync();
  const googleStatus = useGoogleStatus();
  const pendingConflicts = googleStatus.data?.configured ? googleStatus.data.pendingConflicts : 0;
  const [reconciling, setReconciling] = useState(false);

  const categoryMap = useMemo(
    () => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  function openCreate(at: Date = snapMinutes(new Date(), 5)) {
    setDraft({ kind: 'create', start: at, end: addMinutes(at, DEFAULT_DURATION_MINUTES) });
  }

  function report(error: unknown) {
    setNotice({ text: error instanceof Error ? error.message : 'Something went wrong' });
  }

  async function deleteWithUndo(entry: TimeEntry) {
    await mutations.remove.mutateAsync(entry.id);
    setNotice({ text: 'Entry deleted', undo: () => mutations.restore.mutateAsync(entry.id).catch(report) });
  }

  async function changeCategory(entry: TimeEntry, categoryId: string | null) {
    const previous = entry.categoryId;
    await mutations.update.mutateAsync({ id: entry.id, patch: { categoryId } });
    const name = (categoryId && categoryMap.get(categoryId)?.name) ?? 'no category';
    setNotice({
      text: `Moved to ${name}`,
      undo: () => mutations.update.mutateAsync({ id: entry.id, patch: { categoryId: previous } }).catch(report),
    });
  }

  function sync() {
    syncMutation.mutate(undefined, {
      onSuccess: (summary) =>
        setNotice({
          text: formatSyncSummary(summary),
          ...(summary.pull.conflicts + summary.push.conflicts > 0 || pendingConflicts > 0
            ? { action: { label: 'Reconcile', run: () => setReconciling(true) } }
            : {}),
        }),
      onError: (error) =>
        setNotice(
          error instanceof ApiError && error.status === 409
            ? { text: 'Google Calendar isn\'t connected', action: { label: 'Settings', run: onOpenSettings } }
            : { text: `Sync failed: ${error.message}` },
        ),
    });
  }

  function duplicate(entry: TimeEntry) {
    setDraft({
      kind: 'create',
      start: new Date(entry.start),
      end: new Date(entry.end),
      title: entry.title,
      categoryId: entry.categoryId,
      notes: entry.notes,
    });
  }

  const openMenu = (entry: TimeEntry, position: { x: number; y: number }) => setMenu({ entry, ...position });
  const editing = draft?.kind === 'edit' ? draft.entry : undefined;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <CalendarToolbar
          title={rangeTitle(view, date, compact)}
          view={view}
          compact={compact}
          onViewChange={setView}
          onToday={() => setDate(new Date())}
          onPrevious={() => setDate((d) => shiftDate(view, d, -1))}
          onNext={() => setDate((d) => shiftDate(view, d, 1))}
          onCreate={() => openCreate()}
          onOpenSettings={onOpenSettings}
          onSync={sync}
          syncing={syncMutation.isPending}
          pendingConflicts={pendingConflicts}
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
          <ScheduleView
            days={days}
            entries={entries.data ?? []}
            categories={categoryMap}
            onSelect={(entry) => setDraft({ kind: 'edit', entry })}
            onOpenMenu={openMenu}
          />
        ) : (
          <TimeGrid
            days={days}
            entries={entries.data ?? []}
            categories={categoryMap}
            onCreateAt={openCreate}
            onSelect={(entry) => setDraft({ kind: 'edit', entry })}
            onOpenMenu={openMenu}
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

      <EntryContextMenu
        state={menu}
        categories={categories.data ?? []}
        onClose={() => setMenu(null)}
        onChangeCategory={(entry, categoryId) => void changeCategory(entry, categoryId).catch(report)}
        onDuplicate={duplicate}
        onDelete={(entry) => void deleteWithUndo(entry).catch(report)}
      />

      {draft && (
        <EntryDialog
          key={editing?.id ?? `new-${draft.kind === 'create' ? draft.start.getTime() : ''}`}
          draft={draft}
          categories={categories.data ?? []}
          titles={titles.data ?? []}
          onClose={() => setDraft(null)}
          onSubmit={async (input) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, patch: input });
            else await mutations.create.mutateAsync(input);
            setNotice({ text: editing ? 'Entry updated' : 'Entry created' });
          }}
          onDelete={editing ? () => deleteWithUndo(editing) : undefined}
        />
      )}

      {reconciling && <ReconcileDialog onClose={() => setReconciling(false)} />}

      <Snackbar
        open={!!notice}
        autoHideDuration={notice?.undo || notice?.action ? 6000 : 4000}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        message={notice?.text}
        action={
          (notice?.undo || notice?.action) && (
            <Button
              color="primary"
              size="small"
              onClick={() => {
                if (notice.undo) notice.undo();
                else notice.action?.run();
                setNotice(null);
              }}
            >
              {notice.undo ? 'Undo' : notice.action?.label}
            </Button>
          )
        }
      />
    </Box>
  );
}
