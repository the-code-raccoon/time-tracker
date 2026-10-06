import { createTheme } from '@mui/material/styles';

// Dark palette modelled on Google Calendar's dark theme.
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#a8c7fa', contrastText: '#062e6f' },
    secondary: { main: '#c2e7ff' },
    error: { main: '#f2b8b5' },
    background: { default: '#131314', paper: '#1e1f20' },
    text: { primary: '#e3e3e3', secondary: '#c4c7c5' },
    divider: '#444746',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 20 } } },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'transparent' } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
