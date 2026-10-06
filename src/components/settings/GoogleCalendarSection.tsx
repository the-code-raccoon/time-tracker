import Sync from '@mui/icons-material/Sync';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { connectGoogle } from '../../api';
import { useDisconnectGoogle, useGoogleStatus, usePull } from '../../hooks/data';
import { formatPullSummary } from '../../lib/sync';

/** Result of the OAuth redirect, read from ?google=…&detail=… */
export type OAuthResult = { result: 'connected' } | { result: 'error'; detail: string } | null;

type Props = { oauthResult: OAuthResult };

export function GoogleCalendarSection({ oauthResult }: Props) {
  const status = useGoogleStatus();
  const pull = usePull();
  const disconnect = useDisconnectGoogle();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const data = status.data;

  return (
    <Box component="section" aria-labelledby="google-heading">
      <Typography id="google-heading" component="h2" variant="h6" sx={{ mb: 1.5 }}>
        Google Calendar
      </Typography>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, bgcolor: 'transparent' }}>
        <Stack spacing={2}>
          {oauthResult?.result === 'connected' && <Alert severity="success">Google Calendar connected. Run a sync to import your entries.</Alert>}
          {oauthResult?.result === 'error' && <Alert severity="error">Couldn't connect Google Calendar: {oauthResult.detail}</Alert>}
          {status.isPending && <CircularProgress size={24} aria-label="Loading" />}
          {status.isError && <Alert severity="error">Couldn't load the connection status: {status.error.message}</Alert>}

          {data && !data.configured && (
            <Alert severity="info">
              Google Calendar isn't set up on the server yet. Add the <code>GOOGLE_*</code> and <code>TOKEN_ENCRYPTION_KEY</code> environment
              variables (see the README).
            </Alert>
          )}

          {data?.configured && !data.connected && (
            <>
              <Typography variant="body2" color="text.secondary">
                Connect the Google account that owns your Schedule calendar to import and sync entries.
              </Typography>
              <Box>
                <Button variant="contained" onClick={connectGoogle}>
                  Connect Google Calendar
                </Button>
              </Box>
            </>
          )}

          {data?.configured && data.connected && (
            <>
              <Box>
                <Typography>Connected{data.email ? ` as ${data.email}` : ''}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                  Calendar: {data.calendarId}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.lastPullAt ? `Last synced ${formatDistanceToNow(new Date(data.lastPullAt), { addSuffix: true })}` : 'Not synced yet'}
                </Typography>
                {data.pendingConflicts > 0 && (
                  <Typography variant="body2" sx={{ color: 'warning.main', mt: 0.5 }}>
                    {data.pendingConflicts} {data.pendingConflicts === 1 ? 'entry was' : 'entries were'} changed in both places and will
                    need reconciling (coming in the next milestone).
                  </Typography>
                )}
              </Box>

              {pull.isSuccess && <Alert severity="success">{formatPullSummary(pull.data)}</Alert>}
              {pull.isError && <Alert severity="error">{pull.error.message}</Alert>}

              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  startIcon={pull.isPending ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  disabled={pull.isPending}
                  onClick={() => pull.mutate()}
                >
                  {pull.isPending ? (data.lastPullAt ? 'Syncing…' : 'Importing…') : data.lastPullAt ? 'Sync now' : 'Import from Google Calendar'}
                </Button>
                {confirmingDisconnect ? (
                  <>
                    <Typography variant="body2">Disconnect? Your entries stay in the app.</Typography>
                    <Button color="error" onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirmingDisconnect(false) })}>
                      Disconnect
                    </Button>
                    <Button color="inherit" onClick={() => setConfirmingDisconnect(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button color="inherit" onClick={() => setConfirmingDisconnect(true)}>
                    Disconnect
                  </Button>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
