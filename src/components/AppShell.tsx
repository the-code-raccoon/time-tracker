import Logout from '@mui/icons-material/Logout';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

type Props = { onLogout: () => void };

export function AppShell({ onLogout }: Props) {
  const [today] = useState(() =>
    new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()),
  );

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Time Tracker
          </Typography>
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={onLogout}>
              <Logout />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" component="p">
          {today}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Calendar views are coming in milestone M1.
        </Typography>
      </Box>
    </Box>
  );
}
