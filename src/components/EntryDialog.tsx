import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Category, TimeEntry, TimeEntryInput, TitleSuggestion } from '../../shared/types';
import { createRange, isValidRange } from '../lib/timeRange';
import { DateTimeRangeEditor } from './datetime/DateTimeRangeEditor';
import { CategorySelect, TitleField } from './TitleField';

export type EntryDraft =
  | {
      kind: 'create';
      start: Date;
      end: Date;
      /** Prefilled fields, e.g. when duplicating (CTX-4). */
      title?: string;
      categoryId?: string | null;
      notes?: string | null;
    }
  | { kind: 'edit'; entry: TimeEntry };

type Props = {
  draft: EntryDraft;
  categories: Category[];
  titles: TitleSuggestion[];
  onSubmit: (input: TimeEntryInput) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
};

export function EntryDialog({ draft, categories, titles, onSubmit, onDelete, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const initial =
    draft.kind === 'edit'
      ? { ...draft.entry, start: new Date(draft.entry.start), end: new Date(draft.entry.end) }
      : { ...draft, title: draft.title ?? '', categoryId: draft.categoryId ?? null, notes: draft.notes ?? null };

  const [title, setTitle] = useState(initial.title);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [range, setRange] = useState(() => createRange(initial.start, initial.end));
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const titleError = submitted && !title.trim() ? 'Add a title' : undefined;
  const valid = isValidRange(range);

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

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitted(true);
    if (!title.trim() || !valid) return;
    void run(() =>
      onSubmit({
        title,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        categoryId: categoryId || null,
        notes: notes.trim() ? notes : null,
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      // A date/time field commits typed text on blur; submit after that update has rendered.
      (document.activeElement as HTMLElement | null)?.blur();
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      onKeyDown={handleKeyDown}
      slotProps={{ paper: { component: 'form', ref: formRef, onSubmit: handleSubmit, noValidate: true } as object }}
    >
      <DialogTitle>{draft.kind === 'edit' ? 'Edit entry' : 'New entry'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TitleField
            value={title}
            onChange={setTitle}
            onPickCategory={(id) => setCategoryId(id ?? '')}
            titles={titles}
            categories={categories}
            error={titleError}
            autoFocus
          />

          <DateTimeRangeEditor range={range} onChange={setRange} />

          <CategorySelect value={categoryId} onChange={setCategoryId} categories={categories} />

          <TextField label="Notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />

          {error && (
            <Typography role="alert" color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {onDelete && (
          <Button color="error" onClick={() => void run(onDelete)} disabled={busy} sx={{ mr: 'auto' }}>
            Delete
          </Button>
        )}
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy || !valid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
