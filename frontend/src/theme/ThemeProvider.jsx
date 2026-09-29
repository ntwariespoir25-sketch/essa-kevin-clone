import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/*
 * Cross-cutting display preferences for every portal.
 *
 * Before this existed the app only reacted to the operating system's dark mode
 * (a bare prefers-color-scheme block) and had no way for a user to choose. The
 * choice also did not survive a reload. This provider centralises those
 * preferences, persists them, and applies them to <html> so the token layer in
 * tokens.css can respond.
 *
 * Coverage here is intentionally display-only so it works for signed-out users
 * too (the login screen). Per-account preferences can sync to the server later
 * without changing this surface.
 */

const STORAGE_KEY = 'essa.preferences.v1';

const DEFAULTS = {
  theme: 'auto',        // 'light' | 'dark' | 'auto'
  contrast: 'normal',   // 'normal' | 'high'
  cvd: 'none',          // 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  fontScale: 1,         // 0.875 .. 1.25
  reducedMotion: 'system' // 'system' | 'reduce'
};

const FONT_STEPS = [0.875, 1, 1.125, 1.25];

const PreferencesContext = createContext(null);

const readStored = () => {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    // Merge so a stored value from an older shape still yields a full object.
    const merged = { ...DEFAULTS, ...parsed };
    if (!FONT_STEPS.includes(merged.fontScale)) merged.fontScale = DEFAULTS.fontScale;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const ThemeProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while theme is 'auto'.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = preferences.theme === 'auto'
    ? (systemDark ? 'dark' : 'light')
    : preferences.theme;

  // Persist.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      /* storage may be unavailable (private mode); preferences stay in memory */
    }
  }, [preferences]);

  // Apply to <html>.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.contrast = preferences.contrast;
    root.dataset.cvd = preferences.cvd;
    root.style.setProperty('--font-scale', String(preferences.fontScale));
    root.dataset.reducedMotion = preferences.reducedMotion === 'reduce' ? 'reduce' : 'system';
    return undefined;
  }, [resolvedTheme, preferences.contrast, preferences.cvd, preferences.fontScale, preferences.reducedMotion]);

  const setPreference = useCallback((key, value) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setPreferences({ ...DEFAULTS }), []);

  const cycleTheme = useCallback(() => {
    setPreferences((prev) => {
      const order = ['light', 'dark', 'auto'];
      const next = order[(order.indexOf(prev.theme) + 1) % order.length];
      return { ...prev, theme: next };
    });
  }, []);

  const value = useMemo(() => ({
    preferences,
    resolvedTheme,
    systemDark,
    setPreference,
    reset,
    cycleTheme,
    fontSteps: FONT_STEPS
  }), [preferences, resolvedTheme, systemDark, setPreference, reset, cycleTheme]);

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a ThemeProvider');
  return ctx;
};

export default ThemeProvider;
