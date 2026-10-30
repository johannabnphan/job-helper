// Hash routes for the app: #dashboard, #jobs, #applications, #focus, #settings, #onboarding.
export type Route = 'dashboard' | 'jobs' | 'applications' | 'focus' | 'settings' | 'onboarding';

const ROUTES: Route[] = ['dashboard', 'jobs', 'applications', 'focus', 'settings', 'onboarding'];

export function currentRoute(): { route: Route; arg: string } {
  const [name, ...rest] = location.hash.slice(1).split('/');
  const route = (ROUTES as string[]).includes(name) ? (name as Route) : 'dashboard';
  return { route, arg: decodeURIComponent(rest.join('/')) };
}

export function go(route: Route, arg = ''): void {
  location.hash = arg ? `${route}/${encodeURIComponent(arg)}` : route;
}
