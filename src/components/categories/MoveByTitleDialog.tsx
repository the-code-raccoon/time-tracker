import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { Category, TitleSuggestion } from '../../../shared/types';

const NONE = 'none';

type Props = {
  titles: TitleSuggestion[];
  categories: Category[];
  onConfirm: (title: string, categoryId: string | null) => Promise<{ moved: number }>;
  onDone: (moved: number) => void;
  onClose: () => void;
};

/** CAT-12: move every entry with a title to a category (e.g. all "shower" → Self-care). */
export function MoveByTitleDialog({ titles, categories, onConfirm, onDone, onClose }: Props) {
  const [title, setTitle] = useState<TitleSuggestion | null>(null);
  const [target, setTarget] = useState(categories[0]?.id ?? NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!title) return;
    setBusy(true);
    try {
      const { moved } = await onConfirm(title.title, target === NONE ? null : target);
      onDone(moved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Move entries by title</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Autocomplete
            options={titles}
            value={title}
            onChange={(_, value) => setTitle(value)}
            getOptionLabel={(option) => option.title}
            renderOption={({ key, ...props }, option) => (
              <li key={key} {...props}>
                {option.title}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto', pl: 2 }}>
                  {option.count}
                </Typography>
              </li>
            )}
            renderInput={(params) => <TextField {...params} label="Title" autoFocus />}
          />
          <TextField select label="Move to" value={target} onChange={(e) => setTarget(e.target.value)}>
            <MenuItem value={NONE}>
              <em>No category</em>
            </MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          {title && (
            <Typography variant="body2" color="text.secondary">
              {title.count} {title.count === 1 ? 'entry' : 'entries'} titled “{title.title}”. A backup is kept for 30 days.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button onClick={() => void confirm()} disabled={busy || !title} variant="contained">
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}
