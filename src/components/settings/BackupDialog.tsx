import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { useState } from 'react';
import { GCAL_COLORS, gcalColorName } from '../../../shared/gcalColors';
import type { BackupCopy, BackupItem, RestoreSummary, RestoreTarget } from '../../../shared/types';
import { UNCATEGORISED_COLOR } from '../../lib/color';
import { TRIGGER_LABELS } from '../../lib/backups';
import { formatTimeRange } from '../../lib/dates';
import { useBackup, useCategories, useGoogleStatus, useRestoreBackup } from '../../hooks/data';

const PAGE = 200;


const TARGETS: Record<RestoreTarget, { label: string; explain: string }> = {
  app: {
    label: 'The app',
    explain: "Entries go back to the app's copy in this backup. The next sync sends them to Google Calendar.",
  },
  google: {
    label: 'Google Calendar',
    explain:
      "Events go back to Google's copy in this backup (deleted ones are brought back). The next sync brings them into the app, or asks you to reconcile any you've changed in the app since.",
  },
  both: {
    label: 'Both',
    explain: "The app gets the app's copy and Google Calendar gets Google's copy.",
  },
};

const changedFor = (item: BackupItem, target: RestoreTarget) =>
  (target !== 'google' && item.app !== null && item.appChanged) || (target !== 'app' && item.google !== null && item.googleChanged);

function summaryText(result: RestoreSummary): string {
  const parts = [
    result.app > 0 && `${result.app.toLocaleString()} restored in the app`,
    result.google > 0 && `${result.google.toLocaleString()} restored in Google Calendar`,
  ].filter(Boolean);
  let text = parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing needed restoring.';
  if (result.remaining > 0) text += ` ${result.remaining.toLocaleString()} more ran out of time: restore again to finish.`;
  if (result.failed.length > 0) text += ` ${result.failed.length} failed: ${result.failed.map((f) => `${f.title} (${f.error})`).join('; ')}.`;
  return text;
}

function Copy({ label, copy, color, changed }: { label: string; copy: BackupCopy; color: string; changed: boolean }) {
  const start = copy.start ? new Date(copy.start) : null;
  const end = copy.end ? new Date(copy.end) : null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, fontSize: 13 }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 52, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: copy.deleted ? 'line-through' : 'none' }}>
        {copy.title ?? '(no title)'}
        {start && end && <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${format(start, 'MMM d')}, ${formatTimeRange(start, end)}`}</Box>}
      </Box>
      {copy.deleted && <Chip label="Deleted" size="small" variant="outlined" sx={{ height: 20 }} />}
      {changed && <Chip label="Differs from now" size="small" color="warning" variant="outlined" sx={{ height: 20, flexShrink: 0 }} />}
    </Box>
  );
}

type Props = { id: string; onClose: () => void };

/** BAK-4: what a backup holds, compared with now, and restoring all of it or chosen items. */
export function BackupDialog({ id, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const backup = useBackup(id);
  const categories = useCategories();
  const google = useGoogleStatus();
  const restore = useRestoreBackup();
  const googleConnected = google.data?.configured === true && google.data.connected;

  const [onlyChanged, setOnlyChanged] = useState(true);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<RestoreTarget>('app');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RestoreSummary | null>(null);

  const categoryColor = (categoryId: string | null) => categories.data?.find((c) => c.id === categoryId)?.appColor ?? UNCATEGORISED_COLOR;
  const googleColor = (colorId: string | null | undefined) => GCAL_COLORS.find((c) => c.id === colorId)?.hex ?? UNCATEGORISED_COLOR;

  const items = backup.data?.items ?? [];
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (!onlyChanged || item.appChanged || item.googleChanged) &&
      (!needle || [item.app?.title, item.google?.title].some((title) => title?.toLowerCase().includes(needle))),
  );
  const chosen = selected.size > 0 ? items.filter((item) => selected.has(item.key)) : visible;
  const toRestore = chosen.filter((item) => changedFor(item, target)).length;

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function run() {
    setConfirming(false);
    restore.mutate(
      { id, target, keys: chosen.length === items.length ? undefined : chosen.map((item) => item.key) },
      {
        onSuccess: (summary) => {
          setResult(summary);
          setSelected(new Set());
        },
      },
    );
  }

  return (
    <Dialog open onClose={restore.isPending ? undefined : onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>
        {backup.data ? `${TRIGGER_LABELS[backup.data.trigger]} · ${format(new Date(backup.data.createdAt), 'MMM d, yyyy, h:mm a')}` : 'Backup'}
        {backup.data?.description && (
          <Typography variant="body2" color="text.secondary">
            {backup.data.description}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <TextField size="small" placeholder="Filter by title" value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Filter by title' } }} />
          <FormControlLabel control={<Switch checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} />} label="Only what differs from now" />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {visible.length.toLocaleString()} of {items.length.toLocaleString()}
          </Typography>
        </Box>

        {backup.isPending && <CircularProgress sx={{ m: 3 }} aria-label="Loading backup" />}
        {backup.isError && <Alert severity="error" sx={{ m: 2 }}>Couldn't load the backup: {backup.error.message}</Alert>}
        {backup.data && visible.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            {onlyChanged ? 'Everything in this backup matches the app and Google Calendar now.' : 'No items match.'}
          </Typography>
        )}

        <Box component="ul" aria-label="Backed-up items" sx={{ listStyle: 'none', m: 0, p: 0, overflowY: 'auto', flex: 1 }}>
          {visible.slice(0, shown).map((item) => (
            <Box component="li" key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
              <Checkbox
                size="small"
                checked={selected.has(item.key)}
                onChange={() => toggle(item.key)}
                slotProps={{ input: { 'aria-label': `Select ${item.app?.title ?? item.google?.title ?? 'item'}` } }}
              />
              <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {item.app && <Copy label="App" copy={item.app} color={categoryColor(item.app.categoryId)} changed={item.appChanged} />}
                {item.google && (
<Copy label="Google" copy={item.google} color={googleColor(item.google.colorId)} changed={item.googleChanged} />
                )}
              </Box>
              {item.google?.colorId !== undefined && (
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' }, width: 80, flexShrink: 0 }}>
                  {gcalColorName(item.google.colorId ?? null)}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        {visible.length > shown && (
          <Button onClick={() => setShown((n) => n + PAGE)} sx={{ m: 1, alignSelf: 'center' }}>
            Show {Math.min(PAGE, visible.length - shown)} more
          </Button>
        )}
      </DialogContent>

      {(result || restore.isError) && (
        <Alert severity={restore.isError || (result && result.failed.length > 0) ? 'error' : 'success'} sx={{ mx: 2, mt: 1.5 }} role="status">
          {restore.isError ? `Restore failed: ${restore.error.message}` : summaryText(result!)}
        </Alert>
      )}

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label="Restore to"
          value={target}
          onChange={(event) => setTarget(event.target.value as RestoreTarget)}
          sx={{ minWidth: 170, mr: 'auto' }}
        >
          {(Object.keys(TARGETS) as RestoreTarget[]).map((key) => (
            <MenuItem key={key} value={key} disabled={key !== 'app' && !googleConnected}>
              {TARGETS[key].label}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={onClose} color="inherit" disabled={restore.isPending}>
          Close
        </Button>
        <Button variant="contained" onClick={() => setConfirming(true)} disabled={restore.isPending || toRestore === 0}>
          {restore.isPending ? 'Restoring…' : selected.size > 0 ? `Restore ${toRestore} selected` : `Restore ${toRestore}`}
        </Button>
      </DialogActions>

      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="xs">
        <DialogTitle>Restore {toRestore.toLocaleString()} {toRestore === 1 ? 'item' : 'items'} to {TARGETS[target].label.toLowerCase()}?</DialogTitle>
        <DialogContent>
          <DialogContentText>{TARGETS[target].explain}</DialogContentText>
          <DialogContentText sx={{ mt: 1.5 }}>A backup of how things are now is taken first, so this can be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={run}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
