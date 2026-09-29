import React from 'react';
import { usePreferences } from '../theme/ThemeProvider';

/*
 * Small header control that cycles light -> dark -> match system. A full set of
 * options lives in PreferencesPanel; this is the one-click shortcut so people
 * can flip the theme without opening settings.
 */

const ICONS = { light: 'fas fa-sun', dark: 'fas fa-moon', auto: 'fas fa-circle-half-stroke' };
const LABELS = { light: 'Light theme', dark: 'Dark theme', auto: 'Match system' };

const ThemeToggle = ({ size = 36, color, background = 'transparent', border = 'transparent' }) => {
  const { preferences, cycleTheme } = usePreferences();
  const title = `${LABELS[preferences.theme]} (click to change)`;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={title}
      aria-label={title}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background,
        color: color || 'var(--text-muted)',
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontSize: size * 0.42
      }}
    >
      <i className={ICONS[preferences.theme]} aria-hidden="true" />
    </button>
  );
};

export default ThemeToggle;
