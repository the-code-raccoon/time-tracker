import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useEffect, useState } from 'react';
import { getSession, logout } from './api';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';

type AuthState = 'checking' | 'signed-out' | 'signed-in';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  useEffect(() => {
    getSession()
      .then((signedIn) => setAuth(signedIn ? 'signed-in' : 'signed-out'))
      .catch(() => setAuth('signed-out'));
  }, []);

  async function handleLogout() {
    await logout().catch(() => undefined);
    setAuth('signed-out');
  }

  if (auth === 'checking') {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (auth === 'signed-out') return <LoginPage onLoggedIn={() => setAuth('signed-in')} />;
  return <AppShell onLogout={handleLogout} />;
}
