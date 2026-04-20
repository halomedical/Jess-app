/**
 * Base URL for API calls from the browser. Empty string means same origin as the page (recommended in production).
 *
 * Common misconfiguration: `VITE_API_URL=http://localhost:3000` baked into a Heroku build. Mobile browsers then
 * try to reach *their own* localhost and fail with "Load failed".
 */
export function getClientApiBase(): string {
  const raw = typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_API_URL ?? '').trim() : '';
  if (typeof window === 'undefined') return raw.replace(/\/$/, '');
  if (!raw) return '';

  try {
    const pageHost = window.location.hostname;
    const isPageLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
    const apiUrl = new URL(raw, window.location.origin);
    const apiHost = apiUrl.hostname;
    const isApiLocal = apiHost === 'localhost' || apiHost === '127.0.0.1';
    if (isApiLocal && !isPageLocal) {
      // eslint-disable-next-line no-console
      console.warn(
        '[API] Ignoring VITE_API_URL pointing at localhost while the app is not served from localhost. Using same-origin requests instead.'
      );
      return '';
    }
    return raw.replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}
