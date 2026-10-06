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
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Category, TimeEntry, TimeEntryInput, TitleSuggestion } from '../../shared/types';
import { UNCATEGORISED_COLOR } from '../lib/color';
import { formatDuration, fromLocalInput, toLocalInput } from '../lib/dates';

export type EntryDraft = { kind: 'create'; start: Date; end: Date } | { kind: 'edit'; entry: TimeEntry };

type Props = {
  draft: EntryDraft;
  categories: Category[];
  titles: TitleSuggestion[];
  onSubmit: (input: TimeEntryInput) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
};

const MINUTE_STEP_SECONDS = 5 * 60; // TE-1b

export function EntryDialog({ draft, categories, titles, onSubmit, onDelete, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const entry = draft.kind === 'edit' ? draft.entry : undefined;

  const initialStart = entry ? new Date(entry.start) : (draft as { start: Date }).start;
  const initialEnd = entry ? new Date(entry.end) : (draft as { end: Date }).end;

  const [title, setTitle] = useState(entry?.title ?? '');
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? '');
  const [start, setStart] = useState(() => toLocalInput(initialStart));
  const [end, setEnd] = useState(() => toLocalInput(initialEnd));
  const [duration, setDuration] = useState(() => initialEnd.getTime() - initialStart.getTime());
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDate = fromLocalInput(start);
  const endDate = fromLocalInput(end);
  const titleError = submitted && !title.trim() ? 'Add a title' : undefined;
  const timeError =
    !startDate || !endDate ? 'Enter a start and end' : endDate <= startDate ? 'End must be after start' : undefined;

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
    if (!title.trim() || timeError || !startDate || !endDate) return;
    void run(() =>
      onSubmit({
        title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        categoryId: categoryId || null,
        notes: notes.trim() ? notes : null,
      }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleStartChange(value: string) {
    // Keep the last valid duration when the start moves, like Google Calendar.
    const nextStart = fromLocalInput(value);
    if (nextStart) setEnd(toLocalInput(new Date(nextStart.getTime() + duration)));
    setStart(value);
  }

  function handleEndChange(value: string) {
    const nextEnd = fromLocalInput(value);
    if (startDate && nextEnd && nextEnd > startDate) setDuration(nextEnd.getTime() - startDate.getTime());
    setEnd(value);
  }

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="xs"
      onKeyDown={handleKeyDown}
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit, noValidate: true } as object }}
    >
      <DialogTitle>{entry ? 'Edit entry' : 'New entry'}</DialogTitle>
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

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Start"
              type="datetime-local"
              value={start}
              onChange={(event) => handleStartChange(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: MINUTE_STEP_SECONDS } }}
              fullWidth
            />
            <TextField
              label="End"
              type="datetime-local"
              value={end}
              onChange={(event) => handleEndChange(event.target.value)}
              error={!!timeError}
              helperText={timeError ?? (startDate && endDate ? formatDuration(startDate, endDate) : ' ')}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: MINUTE_STEP_SECONDS } }}
              fullWidth
            />
          </Stack>

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
        <Button type="submit" variant="contained" disabled={busy}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
