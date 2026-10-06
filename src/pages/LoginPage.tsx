import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, login } from '../api';

/** /api/auth/callback puts a failed Google sign-in's reason in the URL. */
const callbackError = () => new URLSearchParams(window.location.search).get('login_error');

export function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(callbackError);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('login_error')) return;
    url.searchParams.delete('login_error');
    window.history.replaceState(window.history.state, '', url);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // The second step: Google sign-in, which redirects back to /api/auth/callback.
      window.location.assign(await login(password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Paper component="form" onSubmit={handleSubmit} sx={{ width: '100%', maxWidth: 380, p: { xs: 3, sm: 4 } }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Time Tracker
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your password, then sign in with Google.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          autoFocus
          fullWidth
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((shown) => !shown)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button type="submit" variant="contained" fullWidth size="large" disabled={submitting || !password} sx={{ mt: 3 }}>
          {submitting ? 'Continuing to Google…' : 'Continue'}
        </Button>
      </Paper>
    </Box>
  );
}
