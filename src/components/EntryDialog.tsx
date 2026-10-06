import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Category, TimeEntry, TimeEntryInput, TitleSuggestion } from '../../shared/types';
import { UNCATEGORISED_COLOR } from '../lib/color';
import { createRange, isValidRange } from '../lib/timeRange';
import { DateTimeRangeEditor } from './datetime/DateTimeRangeEditor';

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
          <Autocomplete
            freeSolo
            options={titles}
            getOptionLabel={(option) => (typeof option === 'string' ? option : option.title)}
            filterOptions={(options, { inputValue }) => {
              const query = inputValue.trim().toLowerCase();
              return options.filter((option) => option.title.includes(query)).slice(0, 8);
            }}
            inputValue={title}
            onInputChange={(_, value) => setTitle(value)}
            onChange={(_, value) => {
              if (value && typeof value !== 'string') {
                setTitle(value.title);
                setCategoryId(value.categoryId ?? '');
              }
            }}
            renderOption={({ key, ...props }, option) => (
              <li key={key} {...props}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    mr: 1.5,
                    flexShrink: 0,
                    bgcolor: categories.find((c) => c.id === option.categoryId)?.appColor ?? UNCATEGORISED_COLOR,
                  }}
                />
                {option.title}
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label="Title" autoFocus required error={!!titleError} helperText={titleError} />
            )}
          />

          <DateTimeRangeEditor range={range} onChange={setRange} />

          <TextField select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: category.appColor, mr: 1.5, display: 'inline-block' }} />
                {category.name}
              </MenuItem>
            ))}
          </TextField>

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
