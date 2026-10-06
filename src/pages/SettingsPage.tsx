import ArrowBack from '@mui/icons-material/ArrowBack';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { BackupsSection } from '../components/settings/BackupsSection';
import { CategoriesSection } from '../components/settings/CategoriesSection';
import { InstallSection } from '../components/settings/InstallSection';
import { GoogleCalendarSection, type OAuthResult } from '../components/settings/GoogleCalendarSection';

/** Reads (and removes from the URL) the result of the Google OAuth redirect. */
function takeOAuthResult(): OAuthResult {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('google');
  if (!result) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return result === 'connected' ? { result } : { result: 'error', detail: params.get('detail') ?? 'Unknown error' };
}

type Props = { onBack: () => void };

export function SettingsPage({ onBack }: Props) {
  const [oauthResult] = useState(takeOAuthResult);
  // §5.7: Esc goes back (dialogs on this page close themselves first).
  useKeyboardShortcuts(true, { Escape: onBack });
  return (
    <Box sx={{ minHeight: '100dvh' }}>
      <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Tooltip title="Back to calendar">
            <IconButton aria-label="Back to calendar" onClick={onBack} edge="start">
              <ArrowBack />
            </IconButton>
          </Tooltip>
          <Typography component="h1" variant="h6">
            Settings
          </Typography>
        </Toolbar>
      </AppBar>
      <Stack component="main" spacing={4} sx={{ maxWidth: 800, mx: 'auto', p: { xs: 1.5, sm: 3 } }}>
        <GoogleCalendarSection oauthResult={oauthResult} />
        <CategoriesSection />
        <BackupsSection />
        <InstallSection />
      </Stack>
    </Box>
  );
}
