import Alert from '@mui/material/Alert';
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
import type { Category } from '../../../shared/types';

const NONE = 'none';

type Props = {
  mode: 'delete' | 'merge';
  category: Category;
  categories: Category[];
  onConfirm: (moveTo: string | null) => Promise<unknown>;
  onClose: () => void;
};

/** CAT-11: delete a category (its entries go to another category or none) or merge it into another. */
export function DeleteCategoryDialog({ mode, category, categories, onConfirm, onClose }: Props) {
  const others = categories.filter((c) => c.id !== category.id);
  const [target, setTarget] = useState(mode === 'merge' ? (others[0]?.id ?? '') : NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = category.entryCount;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(target === NONE ? null : target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{mode === 'merge' ? `Merge “${category.name}”` : `Delete “${category.name}”?`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Typography variant="body2">
            {mode === 'merge'
              ? `All ${count} ${count === 1 ? 'entry' : 'entries'} will move to the category you choose, and “${category.name}” will be removed.`
              : count === 0
                ? 'This category has no entries.'
                : `It has ${count} ${count === 1 ? 'entry' : 'entries'}. Choose where ${count === 1 ? 'it goes' : 'they go'}.`}
          </Typography>
          {(mode === 'merge' || count > 0) && (
            <TextField select label={mode === 'merge' ? 'Merge into' : 'Move entries to'} value={target} onChange={(e) => setTarget(e.target.value)}>
              {mode === 'delete' && (
                <MenuItem value={NONE}>
                  <em>No category</em>
                </MenuItem>
              )}
              {others.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {count > 0 && (
            <Typography variant="caption" color="text.secondary">
              A backup of the affected entries is kept for 30 days.
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button onClick={() => void confirm()} disabled={busy || !target} variant="contained" color={mode === 'delete' ? 'error' : 'primary'}>
          {mode === 'merge' ? 'Merge' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
