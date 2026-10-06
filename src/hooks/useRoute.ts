import { useCallback, useSyncExternalStore } from 'react';

export type Route = 'calendar' | 'categories';

const PATHS: Record<Route, string> = { calendar: '/', categories: '/settings/categories' };

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

const currentRoute = (): Route => (window.location.pathname.startsWith(PATHS.categories) ? 'categories' : 'calendar');

/** Minimal history-based routing for the two pages (Vercel rewrites every path to index.html). */
export function useRoute(): [Route, (route: Route) => void] {
  const route = useSyncExternalStore(subscribe, currentRoute);
  const navigate = useCallback((next: Route) => {
    if (currentRoute() === next) return;
    window.history.pushState(null, '', PATHS[next]);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  return [route, navigate];
}
