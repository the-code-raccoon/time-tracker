import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { addDays } from 'date-fns';
import { useState, type FormEvent } from 'react';
import type { Category, Timer, TimerInput, TitleSuggestion } from '../../../shared/types';
import { formatElapsed } from '../../lib/dates';
import { atWallMinutes } from '../../lib/drag';
import { formatDateLabel, minutesOfDay } from '../../lib/parse';
import { useNow } from '../../hooks/useNow';
import { TimeField } from '../datetime/fields';
import { CategorySelect, TitleField } from '../TitleField';

type Props = {
  /** The running timer, or null to start one. */
  timer: Timer | null;
  categories: Category[];
  titles: TitleSuggestion[];
  onStart: (input: TimerInput) => Promise<unknown>;
  onSave: (patch: Partial<TimerInput>) => Promise<unknown>;
  onStop: () => Promise<unknown>;
  onDiscard: () => Promise<unknown>;
  onClose: () => void;
};

/**
 * A typed start time is the most recent such time: later than now means yesterday.
 * Typing "9:30" at 3pm means 9:30am (the am/pm reference is 12 hours back).
 */
function pastTime(minutes: number, now: Date): Date {
  const today = atWallMinutes(now, minutes);
  return today > now ? atWallMinutes(addDays(now, -1), minutes) : today;
}

/** TE-5: start the timer, or edit, stop or discard the running one. */
export function TimerDialog({ timer, categories, titles, onStart, onSave, onStop, onDiscard, onClose }: Props) {
  const now = useNow(1000);
  const [title, setTitle] = useState(timer?.title ?? '');
  const [categoryId, setCategoryId] = useState(timer?.categoryId ?? '');
  const [startedAt, setStartedAt] = useState(() => (timer ? new Date(timer.startedAt) : null));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleError = submitted && !title.trim() ? 'Add a title' : undefined;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  function changes(): Partial<TimerInput> {
    if (!timer) return {};
    const patch: Partial<TimerInput> = {};
    if (title.trim() !== timer.title) patch.title = title;
    if ((categoryId || null) !== timer.categoryId) patch.categoryId = categoryId || null;
    if (startedAt && startedAt.toISOString() !== timer.startedAt) patch.startedAt = startedAt.toISOString();
    return patch;
  }

  function withTitle(action: () => Promise<unknown>) {
    setSubmitted(true);
    if (title.trim()) void run(action);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!timer) withTitle(() => onStart({ title, categoryId: categoryId || null }));
    else withTitle(() => (Object.keys(changes()).length > 0 ? onSave(changes()) : Promise.resolve()));
  }

  function stop() {
    // Save edits first, so the entry is logged with them.
    withTitle(async () => {
      const patch = changes();
      if (Object.keys(patch).length > 0) await onSave(patch);
      await onStop();
    });
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit, noValidate: true } as object }}
    >
      <DialogTitle>{timer ? 'Timer' : 'Start timer'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {timer && startedAt && (
            <Typography variant="h4" component="p" aria-label="Elapsed" sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
              {formatElapsed(now.getTime() - startedAt.getTime())}
            </Typography>
          )}
          <TitleField
            value={title}
            onChange={setTitle}
            onPickCategory={(id) => setCategoryId(id ?? '')}
            titles={titles}
            categories={categories}
            error={titleError}
            autoFocus={!timer}
          />
          <CategorySelect value={categoryId} onChange={setCategoryId} categories={categories} />
          {startedAt && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Started at
              </Typography>
              <TimeField
                ariaLabel="Started at"
                value={startedAt}
                referenceMinutes={minutesOfDay(now) - 12 * 60}
                onChange={(minutes) => setStartedAt(pastTime(minutes, now))}
              />
              <Typography variant="caption" color="text.secondary">
                {formatDateLabel(startedAt)}
              </Typography>
            </Box>
          )}
          {error && (
            <Typography role="alert" color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {timer && (
          <Button color="error" onClick={() => void run(onDiscard)} disabled={busy} sx={{ mr: 'auto' }}>
            Discard
          </Button>
        )}
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        {timer ? (
          <>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
            <Button variant="contained" onClick={stop} disabled={busy}>
              Stop
            </Button>
          </>
        ) : (
          <Button type="submit" variant="contained" disabled={busy}>
            Start
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
