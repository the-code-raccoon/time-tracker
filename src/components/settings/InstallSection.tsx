import InstallDesktop from '@mui/icons-material/InstallDesktop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

/** PWA install (M5): an app icon on the home screen or dock, opening without the browser's toolbars. */
export function InstallSection() {
  const { installed, install } = useInstallPrompt();
  return (
    <Box component="section" aria-labelledby="install-heading">
      <Typography id="install-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        Install app
      </Typography>
      {installed ? (
        <Typography variant="body2" color="text.secondary">
          You're using the installed app.
        </Typography>
      ) : install ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Add Time Tracker to your home screen or dock, so it opens like an app.
          </Typography>
          <Button variant="outlined" startIcon={<InstallDesktop />} onClick={() => void install()}>
            Install
          </Button>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">
          On iPhone or iPad: tap Share, then <strong>Add to Home Screen</strong>. In Chrome or Edge, use <strong>Install</strong> in the
          address bar or the browser menu.
        </Typography>
      )}
    </Box>
  );
}
