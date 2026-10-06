import ChevronRight from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { format } from 'date-fns';
import { useState } from 'react';
import { useBackups } from '../../hooks/data';
import { TRIGGER_LABELS } from '../../lib/backups';
import { BackupDialog } from './BackupDialog';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** BAK-4: snapshots from the last 30 days; open one to see what it holds and restore it. */
export function BackupsSection() {
  const backups = useBackups();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Box component="section" aria-labelledby="backups-heading">
      <Typography id="backups-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        Backups
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Taken once a day, before each sync that changes Google Calendar, and before bulk changes. Kept for 30 days.
      </Typography>
      {backups.isPending && <CircularProgress size={24} aria-label="Loading backups" />}
      {backups.isError && <Alert severity="error">Couldn't load backups: {backups.error.message}</Alert>}
      {backups.data?.length === 0 && <Typography color="text.secondary">No backups yet.</Typography>}
      {backups.data && backups.data.length > 0 && (
        <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, bgcolor: 'transparent', maxHeight: 420, overflowY: 'auto' }}>
          {backups.data.map((backup, index) => (
            <Box component="li" key={backup.id} sx={{ borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}>
              <ButtonBase
                onClick={() => setOpen(backup.id)}
                sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 2, px: 2, py: 1.25, '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' } }}
              >
                <Box sx={{ width: { xs: 96, sm: 150 }, flexShrink: 0 }}>
                  <Typography variant="body2">{format(new Date(backup.createdAt), 'MMM d, h:mm a')}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {TRIGGER_LABELS[backup.trigger]}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {backup.description ?? TRIGGER_LABELS[backup.trigger]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {plural(backup.entryCount, 'entry', 'entries')} · {plural(backup.eventCount, 'event', 'events')}
                  </Typography>
                </Box>
                <ChevronRight sx={{ color: 'text.secondary' }} />
              </ButtonBase>
            </Box>
          ))}
        </Paper>
      )}
      {open && <BackupDialog id={open} onClose={() => setOpen(null)} />}
    </Box>
  );
}
