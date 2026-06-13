// Light/dark theme state. Light is the default; the choice persists in
// localStorage and is applied as a `data-theme` attribute on <html>.
// An inline script in index.html applies the stored value before first paint
// (anti-FOUC); this module keeps it reactive for the rest of the app.

const THEME_KEY = 'flux_theme';

function readStored() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {}
  return 'light';
}

export const theme = $state({ mode: readStored() });

export function applyTheme() {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme.mode);
  }
}

export function setTheme(mode) {
  theme.mode = mode === 'dark' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, theme.mode); } catch {}
  applyTheme();
}

export function toggleTheme() {
  setTheme(theme.mode === 'dark' ? 'light' : 'dark');
}

// Read a CSS custom property off the document root. Reflects the currently
// applied theme, so canvas/Chart.js code that can't use CSS vars directly can
// pull live colors. Touch `theme.mode` in a reactive context to re-run on toggle.
export function cssVar(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
