import { useCallback, useSyncExternalStore } from 'react';

export type Route = 'calendar' | 'settings' | 'reports';

const PATHS: Record<Route, string> = { calendar: '/', settings: '/settings', reports: '/reports' };

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

const currentRoute = (): Route => {
  const path = window.location.pathname;
  if (path.startsWith(PATHS.settings)) return 'settings';
  return path.startsWith(PATHS.reports) ? 'reports' : 'calendar';
};

/** Minimal history-based routing for the pages (Vercel rewrites every path to index.html). */
export function useRoute(): [Route, (route: Route) => void] {
  const route = useSyncExternalStore(subscribe, currentRoute);
  const navigate = useCallback((next: Route) => {
    if (currentRoute() === next) return;
    window.history.pushState(null, '', PATHS[next]);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  return [route, navigate];
}
