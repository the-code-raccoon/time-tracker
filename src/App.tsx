import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, getSession, logout } from './api';
import { AppShell } from './components/AppShell';
import { useRoute } from './hooks/useRoute';
import { CategoriesPage } from './pages/CategoriesPage';
import { LoginPage } from './pages/LoginPage';

type AuthState = 'checking' | 'signed-out' | 'signed-in';

const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [route, navigate] = useRoute();
  const [queryClient] = useState(() => {
    // An expired session on any request sends you back to the login page.
    const onError = (error: unknown) => {
      if (isUnauthorized(error)) setAuth('signed-out');
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
        },
      },
    });
  });

  useEffect(() => {
    getSession()
      .then((signedIn) => setAuth(signedIn ? 'signed-in' : 'signed-out'))
      .catch(() => setAuth('signed-out'));
  }, []);

  async function handleLogout() {
    await logout().catch(() => undefined);
    queryClient.clear();
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
  return (
    <QueryClientProvider client={queryClient}>
      {/* The calendar stays mounted (hidden) so its date and view survive a visit to Categories. */}
      <Box sx={{ display: route === 'calendar' ? 'block' : 'none' }}>
        <AppShell onOpenSettings={() => navigate('categories')} onLogout={handleLogout} />
      </Box>
      {route === 'categories' && <CategoriesPage onBack={() => navigate('calendar')} />}
    </QueryClientProvider>
  );
}
