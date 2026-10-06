import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { useState } from 'react';
import type { Category, Conflict, ConflictChoice, ConflictSide, TimeEntryInput } from '../../shared/types';
import { useCategories, useConflicts, useEntryMutations, useResolveConflicts, useSync, useTitles } from '../hooks/data';
import { UNCATEGORISED_COLOR } from '../lib/color';
import { formatTimeRange } from '../lib/dates';
import { formatSyncSummary } from '../lib/sync';
import { EntryDialog } from './EntryDialog';

type Field = { label: string; value: (side: ConflictSide) => string };

function when(side: ConflictSide): string {
  if (!side.start || !side.end) return '—';
  const start = new Date(side.start);
  return `${format(start, 'EEE MMM d, yyyy')}, ${formatTimeRange(start, new Date(side.end))}`;
}

function SideColumn({ heading, side, fields, differs, categories }: {
  heading: string;
  side: ConflictSide;
  fields: Field[];
  differs: (field: Field) => boolean;
  categories: Map<string, Category>;
}) {
  const category = side.categoryId ? categories.get(side.categoryId) : undefined;
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary">
        {heading}
      </Typography>
      {side.deleted ? (
        <Typography sx={{ color: 'error.main', fontWeight: 500 }}>Deleted</Typography>
      ) : (
        <Box component="dl" sx={{ m: 0 }}>
          {fields.map((field) => (
            <Box
              key={field.label}
              data-differs={differs(field) || undefined}
              sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: differs(field) ? 'rgba(251, 188, 4, 0.14)' : undefined }}
            >
              <Typography component="dt" variant="caption" color="text.secondary">
                {field.label}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-word' }}>
                {field.label === 'Category' && (
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: category?.appColor ?? UNCATEGORISED_COLOR }} />
                )}
                {field.value(side)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** SYNC-7: each entry changed in both places, side by side, with a choice per entry or for all. */
export function ReconcileDialog({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const conflicts = useConflicts();
  const categories = useCategories();
  const titles = useTitles();
  const resolve = useResolveConflicts();
  const sync = useSync();
  const entryMutations = useEntryMutations();
  const [merging, setMerging] = useState<Conflict | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryMap = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const categoryName = (id: string | null) => (id && categoryMap.get(id)?.name) || 'None';
  const fields: Field[] = [
    { label: 'Title', value: (s) => s.title ?? '—' },
    { label: 'When', value: when },
    { label: 'Category', value: (s) => categoryName(s.categoryId) },
    { label: 'Notes', value: (s) => s.notes ?? '—' },
  ];
  const differs = (conflict: Conflict) => (field: Field) =>
    !conflict.app.deleted && !conflict.google.deleted && field.value(conflict.app) !== field.value(conflict.google);

  /** Saves the choices, then syncs so "keep app" choices reach Google straight away. */
  async function choose(resolutions: { entryId: string; choice: ConflictChoice }[]) {
    setError(null);
    try {
      await resolve.mutateAsync(resolutions);
      setResult(formatSyncSummary(await sync.mutateAsync()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const list = conflicts.data ?? [];
  const busy = resolve.isPending || sync.isPending;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="md">
      <DialogTitle>Reconcile changes</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {conflicts.isPending && <CircularProgress aria-label="Loading" />}
          {conflicts.isError && <Alert severity="error">Couldn't load conflicts: {conflicts.error.message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {result && <Alert severity="success">{result}</Alert>}
          {conflicts.isSuccess && list.length === 0 && <Typography color="text.secondary">Nothing to reconcile — the app and Google Calendar agree.</Typography>}

          {list.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                {list.length === 1 ? 'This entry was' : `These ${list.length} entries were`} changed both here and in Google Calendar since the last sync.
                Choose which version to keep. Highlighted fields differ.
              </Typography>
              {list.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                  <Button variant="outlined" color="inherit" disabled={busy} onClick={() => void choose(list.map((c) => ({ entryId: c.entryId, choice: 'app' })))}>
                    Keep all from this app
                  </Button>
                  <Button variant="outlined" color="inherit" disabled={busy} onClick={() => void choose(list.map((c) => ({ entryId: c.entryId, choice: 'google' })))}>
                    Keep all from Google
                  </Button>
                </Stack>
              )}
            </>
          )}

          {list.map((conflict) => {
            const title = conflict.app.title ?? conflict.google.title ?? 'Entry';
            const one = (choice: ConflictChoice) => () => void choose([{ entryId: conflict.entryId, choice }]);
            return (
              <Paper key={conflict.entryId} variant="outlined" component="section" aria-label={title} sx={{ p: 2, bgcolor: 'transparent' }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  {title}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <SideColumn heading="This app" side={conflict.app} fields={fields} differs={differs(conflict)} categories={categoryMap} />
                  <SideColumn heading="Google Calendar" side={conflict.google} fields={fields} differs={differs(conflict)} categories={categoryMap} />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                  {conflict.app.deleted ? (
                    <>
                      <Button variant="contained" color="error" disabled={busy} onClick={one('app')}>
                        Delete
                      </Button>
                      <Button variant="outlined" color="inherit" disabled={busy} onClick={one('google')}>
                        Restore Google's version
                      </Button>
                    </>
                  ) : conflict.google.deleted ? (
                    <>
                      <Button variant="contained" color="error" disabled={busy} onClick={one('google')}>
                        Delete
                      </Button>
                      <Button variant="outlined" color="inherit" disabled={busy} onClick={one('app')}>
                        Keep this app's version
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="contained" disabled={busy} onClick={one('app')}>
                        Keep this app's
                      </Button>
                      <Button variant="contained" disabled={busy} onClick={one('google')}>
                        Keep Google's
                      </Button>
                      <Button color="inherit" disabled={busy} onClick={() => setMerging(conflict)}>
                        Edit and merge…
                      </Button>
                    </>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {busy && <CircularProgress size={20} sx={{ mr: 'auto', ml: 1 }} aria-label="Saving" />}
        <Button onClick={onClose} disabled={busy}>
          Done
        </Button>
      </DialogActions>

      {merging && (
        <EntryDialog
          draft={{
            kind: 'edit',
            entry: {
              id: merging.entryId,
              title: merging.app.title ?? '',
              // "Edit and merge" is only offered when neither side was deleted, so both times exist.
              start: merging.app.start!,
              end: merging.app.end!,
              categoryId: merging.app.categoryId,
              notes: merging.app.notes,
              gcalEventId: null,
              updatedAt: merging.detectedAt,
            },
          }}
          categories={categories.data ?? []}
          titles={titles.data ?? []}
          onClose={() => setMerging(null)}
          onSubmit={async (input: TimeEntryInput) => {
            // The merged version becomes the app's version, and wins.
            await entryMutations.update.mutateAsync({ id: merging.entryId, patch: input });
            await choose([{ entryId: merging.entryId, choice: 'app' }]);
          }}
        />
      )}
    </Dialog>
  );
}
