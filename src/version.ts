declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

/** e.g. "v0.4.0 · built 17 Nov 2026, 14:05" (Swedish time) */
export function versionLabel(iso = BUILD_TIME, version = APP_VERSION): string {
  const when = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(iso));
  return `v${version} · built ${when}`;
}
