'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'vm_theme';

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === 'light') {
    html.classList.add('theme-light');
  } else {
    html.classList.remove('theme-light');
  }
  html.style.colorScheme = t;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial state matches the inline <head> script so the first render
  // already has the correct class on <html>.
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    let initial: Theme;
    if (stored === 'light' || stored === 'dark') {
      initial = stored;
    } else {
      initial =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    }
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
