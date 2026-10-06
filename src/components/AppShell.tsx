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
import { addDays, addMinutes, format, startOfDay } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import type { Category, TimeEntry, Timer } from '../../shared/types';
import { ApiError, fetchPreviousEntry } from '../api';
import { useCategories, useEntries, useEntryMutations, useGoogleStatus, useSync, useTimerMutations, useTitles } from '../hooks/data';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { formatSyncSummary } from '../lib/sync';
import { daysBetween, formatTime, rangeTitle, shiftDate, snapMinutes, VIEW_KEYS, viewRange, type ViewMode } from '../lib/dates';
import { atWallMinutes, type Times } from '../lib/drag';
import { minutesOfDay } from '../lib/parse';
import { CalendarToolbar } from './calendar/CalendarToolbar';
import { MonthView } from './calendar/MonthView';
import { ScheduleView } from './calendar/ScheduleView';
import { TimeGrid } from './calendar/TimeGrid';
import { EntryContextMenu, type ContextMenuState } from './EntryContextMenu';
import { EntryDialog, type EntryDraft } from './EntryDialog';
import { ReconcileDialog } from './ReconcileDialog';
import { GoToDateDialog } from './shortcuts/GoToDateDialog';
import { SearchDialog } from './shortcuts/SearchDialog';
import { ShortcutHelpDialog } from './shortcuts/ShortcutHelpDialog';
import { TimerControl } from './timer/TimerControl';

const DEFAULT_DURATION_MINUTES = 30;

type Notice = { text: string; undo?: () => void; action?: { label: string; run: () => void } };

/** Dialogs opened from the toolbar or a shortcut. */
type Panel = 'search' | 'go-to-date' | 'help' | 'timer' | 'reconcile';

type Props = {
  onOpenSettings: () => void;
  onOpenReports?: () => void;
  onLogout: () => void;
  /** False while another page is shown (the calendar stays mounted): keyboard shortcuts are off. */
  active?: boolean;
};

export function AppShell({ onOpenSettings, onOpenReports = () => {}, onLogout, active = true }: Props) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const [view, setView] = useState<ViewMode>(() => (compact ? 'day' : 'week'));
  const [date, setDate] = useState(() => new Date());
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  // `z` undoes the last undoable action, even after its snackbar has gone.
  const lastUndo = useRef<(() => void) | null>(null);

  const { start, end } = viewRange(view, date);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const days = useMemo(() => daysBetween(new Date(startMs), new Date(endMs)), [startMs, endMs]);
  const entries = useEntries(start, end);
  const categories = useCategories();
  const titles = useTitles();
  const mutations = useEntryMutations();
  const timerMutations = useTimerMutations();
  const syncMutation = useSync();
  const googleStatus = useGoogleStatus();
  const pendingConflicts = googleStatus.data?.configured ? googleStatus.data.pendingConflicts : 0;

  const categoryMap = useMemo(
    () => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );

  function notify(next: Notice) {
    if (next.undo) {
      const undo = next.undo;
      lastUndo.current = () => {
        lastUndo.current = null;
        undo();
      };
    }
    setNotice(next);
  }

  function undoLast() {
    if (!lastUndo.current) return;
    lastUndo.current();
    setNotice(null);
  }

  function openCreate(at: Date = snapMinutes(new Date(), 5)) {
    setDraft({ kind: 'create', start: at, end: addMinutes(at, DEFAULT_DURATION_MINUTES) });
  }

  function report(error: unknown) {
    setNotice({ text: error instanceof Error ? error.message : 'Something went wrong' });
  }

  async function deleteWithUndo(entry: TimeEntry) {
    await mutations.remove.mutateAsync(entry.id);
    notify({ text: 'Entry deleted', undo: () => mutations.restore.mutateAsync(entry.id).catch(report) });
  }

  async function changeCategory(entry: TimeEntry, categoryId: string | null) {
    const previous = entry.categoryId;
    await mutations.update.mutateAsync({ id: entry.id, patch: { categoryId } });
    const name = (categoryId && categoryMap.get(categoryId)?.name) ?? 'no category';
    notify({
      text: `Moved to ${name}`,
      undo: () => mutations.update.mutateAsync({ id: entry.id, patch: { categoryId: previous } }).catch(report),
    });
  }

  /** DRAG-5: a drop saves straight away, with undo. If the save fails the entry goes back. */
  function reschedule(entry: TimeEntry, times: Times, kind: 'move' | 'resize', text = kind === 'move' ? 'Entry moved' : 'Entry resized') {
    const next = { start: times.start.toISOString(), end: times.end.toISOString() };
    mutations.reschedule(
      { entry, times: next },
      {
        onSuccess: () =>
          notify({
            text,
            undo: () =>
              mutations.reschedule(
                { entry: { ...entry, ...next }, times: { start: entry.start, end: entry.end } },
                { onError: report },
              ),
          }),
        onError: (error) => setNotice({ text: `Couldn't ${kind} the entry: ${error.message}` }),
      },
    );
  }

  /** TE-5: the stopped timer is logged as an entry. Undo deletes it and restarts the timer from its original start. */
  function timerLogged(entry: TimeEntry, timer: Timer) {
    notify({
      text: `Logged ${entry.title}`,
      action: { label: 'Edit', run: () => setDraft({ kind: 'edit', entry }) },
      undo: () =>
        void mutations.remove
          .mutateAsync(entry.id)
          .then(() => timerMutations.start.mutateAsync({ title: timer.title, categoryId: timer.categoryId, startedAt: timer.startedAt }))
          .catch(report),
    });
  }

  function sync() {
    if (syncMutation.isPending) return;
    syncMutation.mutate(undefined, {
      onSuccess: (summary) =>
        setNotice({
          text: formatSyncSummary(summary),
          ...(summary.pull.conflicts + summary.push.conflicts > 0 || pendingConflicts > 0
            ? { action: { label: 'Reconcile', run: () => setPanel('reconcile') } }
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

  /** CTX-6: saves a copy one day later at the same local time, with undo. */
  async function duplicateToNextDay(entry: TimeEntry) {
    const start = addDays(new Date(entry.start), 1);
    const copy = await mutations.create.mutateAsync({
      title: entry.title,
      start: start.toISOString(),
      end: addDays(new Date(entry.end), 1).toISOString(),
      categoryId: entry.categoryId,
      notes: entry.notes,
    });
    notify({
      text: `Duplicated to ${format(start, 'EEE, MMM d')}`,
      undo: () => mutations.remove.mutateAsync(copy.id).catch(report),
    });
  }

  /** CTX-7: moves the entry to start when the previous one (TE-8) ends, keeping its duration, with undo. */
  async function moveAfterPrevious(entry: TimeEntry) {
    const previous = await fetchPreviousEntry(new Date(entry.start));
    if (!previous) return setNotice({ text: 'No earlier entry to move after' });
    const start = new Date(previous.end);
    if (start.getTime() === new Date(entry.start).getTime()) return setNotice({ text: `Already right after ${previous.title}` });
    const end = new Date(start.getTime() + new Date(entry.end).getTime() - new Date(entry.start).getTime());
    reschedule(entry, { start, end }, 'move', `Moved to ${formatTime(start)}, after ${previous.title}`);
  }

  function goTo(day: Date, nextView: ViewMode = view) {
    setDate(day);
    setView(nextView);
  }

  /** The entry whose block has keyboard focus (or was last clicked), for `e` and Delete. */
  function selectedEntry(): TimeEntry | undefined {
    const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId;
    return id ? entries.data?.find((entry) => entry.id === id) : undefined;
  }

  const switchTo = (next: ViewMode) => () => setView(next);
  const deleteSelected = () => {
    const entry = selectedEntry();
    if (entry) void deleteWithUndo(entry).catch(report);
  };

  // §5.7 (dialogs, menus and text fields have their own keys; see useKeyboardShortcuts).
  useKeyboardShortcuts(active, {
    k: () => setDate((d) => shiftDate(view, d, -1)),
    p: () => setDate((d) => shiftDate(view, d, -1)),
    j: () => setDate((d) => shiftDate(view, d, 1)),
    n: () => setDate((d) => shiftDate(view, d, 1)),
    t: () => setDate(new Date()),
    g: () => setPanel('go-to-date'),
    ...Object.fromEntries((Object.keys(VIEW_KEYS) as ViewMode[]).flatMap((mode) => VIEW_KEYS[mode].map((key) => [key, switchTo(mode)]))),
    c: () => openCreate(),
    e: () => {
      const entry = selectedEntry();
      if (entry) setDraft({ kind: 'edit', entry });
    },
    Backspace: deleteSelected,
    Delete: deleteSelected,
    z: undoLast,
    '/': () => setPanel('search'),
    r: sync,
    s: onOpenSettings,
    '?': () => setPanel('help'),
  });

  const openMenu = (entry: TimeEntry, position: { x: number; y: number }) => setMenu({ entry, ...position });
  const select = (entry: TimeEntry) => setDraft({ kind: 'edit', entry });
  const editing = draft?.kind === 'edit' ? draft.entry : undefined;
  const timerControl = (variant: 'toolbar' | 'fab') => (
    <TimerControl
      variant={variant}
      categories={categories.data ?? []}
      titles={titles.data ?? []}
      dialogOpen={panel === 'timer'}
      onDialogOpenChange={(open) => setPanel(open ? 'timer' : null)}
      onLogged={timerLogged}
      onError={report}
    />
  );

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
          onSearch={() => setPanel('search')}
          timer={compact ? undefined : timerControl('toolbar')}
          onOpenSettings={onOpenSettings}
          onOpenReports={onOpenReports}
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
          <ScheduleView days={days} entries={entries.data ?? []} categories={categoryMap} onSelect={select} onOpenMenu={openMenu} />
        ) : view === 'month' ? (
          <MonthView
            month={date}
            days={days}
            entries={entries.data ?? []}
            categories={categoryMap}
            onSelect={select}
            onOpenMenu={openMenu}
            onDayClick={(day) => goTo(day, 'day')}
            onCreateOn={(day) => openCreate(atWallMinutes(day, minutesOfDay(snapMinutes(new Date(), 5))))}
          />
        ) : (
          <TimeGrid
            days={days}
            entries={entries.data ?? []}
            categories={categoryMap}
            onCreateAt={openCreate}
            onCreateRange={(times) => setDraft({ kind: 'create', ...times })}
            onReschedule={reschedule}
            onSelect={select}
            onOpenMenu={openMenu}
            onDayClick={(day) => goTo(day, 'day')}
          />
        )}
      </Box>

      {compact && (
        <>
          {timerControl('fab')}
          <Fab color="primary" aria-label="Create entry" onClick={() => openCreate()} sx={{ position: 'fixed', right: 16, bottom: 16 }}>
            <Add />
          </Fab>
        </>
      )}

      <EntryContextMenu
        state={menu}
        categories={categories.data ?? []}
        onClose={() => setMenu(null)}
        onChangeCategory={(entry, categoryId) => void changeCategory(entry, categoryId).catch(report)}
        onDuplicate={duplicate}
        onDuplicateNextDay={(entry) => void duplicateToNextDay(entry).catch(report)}
        onMoveAfterPrevious={(entry) => void moveAfterPrevious(entry).catch(report)}
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

      {panel === 'reconcile' && <ReconcileDialog onClose={() => setPanel(null)} />}
      {panel === 'help' && <ShortcutHelpDialog onClose={() => setPanel(null)} />}
      {panel === 'go-to-date' && (
        <GoToDateDialog
          current={date}
          onClose={() => setPanel(null)}
          onGo={(day) => {
            setPanel(null);
            setDate(day);
          }}
        />
      )}
      {panel === 'search' && (
        <SearchDialog
          categories={categoryMap}
          onClose={() => setPanel(null)}
          onPick={(entry) => {
            setPanel(null);
            goTo(startOfDay(new Date(entry.start)), 'day');
            setDraft({ kind: 'edit', entry });
          }}
        />
      )}

      <Snackbar
        open={!!notice}
        autoHideDuration={notice?.undo || notice?.action ? 6000 : 4000}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        message={notice?.text}
        action={
          <>
            {notice?.action && (
              <Button
                color="primary"
                size="small"
                onClick={() => {
                  notice.action?.run();
                  setNotice(null);
                }}
              >
                {notice.action.label}
              </Button>
            )}
            {notice?.undo && (
              <Button color="primary" size="small" onClick={undoLast}>
                Undo
              </Button>
            )}
          </>
        }
      />
    </Box>
  );
}
