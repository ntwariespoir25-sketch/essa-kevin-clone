import React from 'react';
import { usePreferences } from '../theme/ThemeProvider';

/*
 * User-facing controls for the cross-cutting display preferences. Kept
 * standalone so any portal can drop it into its settings/profile tab without
 * duplicating the markup.
 */

const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-5)',
  boxShadow: 'var(--shadow-sm)'
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) 0',
  borderBottom: '1px solid var(--border)'
};

const labelStyle = { display: 'block', fontWeight: 600, color: 'var(--text)' };
const hintStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 };

const selectStyle = {
  background: 'var(--surface-2)',
  color: 'var(--text)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  fontSize: '0.9rem',
  minWidth: 160
};

const OPTIONS = {
  theme: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Match system' }
  ],
  contrast: [
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High contrast' }
  ],
  cvd: [
    { value: 'none', label: 'Default' },
    { value: 'deuteranopia', label: 'Green/red (deuteranopia)' },
    { value: 'protanopia', label: 'Red/green (protanopia)' },
    { value: 'tritanopia', label: 'Blue/yellow (tritanopia)' }
  ],
  reducedMotion: [
    { value: 'system', label: 'Use system setting' },
    { value: 'reduce', label: 'Reduce motion' }
  ]
};

const Row = ({ label, hint, control }) => (
  <div style={rowStyle}>
    <div>
      <span style={labelStyle}>{label}</span>
      {hint && <span style={hintStyle}>{hint}</span>}
    </div>
    {control}
  </div>
);

const Select = ({ setting, value }) => {
  const { setPreference } = usePreferences();
  const id = `pref-${setting}`;
  return (
    <select
      id={id}
      style={selectStyle}
      value={value}
      onChange={(e) => setPreference(setting, e.target.value)}
      aria-label={setting}
    >
      {OPTIONS[setting].map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
};

export const FontSizeControl = () => {
  const { preferences, setPreference, fontSteps } = usePreferences();
  const index = fontSteps.indexOf(preferences.fontScale);
  const atMin = index <= 0;
  const atMax = index >= fontSteps.length - 1;

  const step = (delta) => {
    const next = Math.min(fontSteps.length - 1, Math.max(0, index + delta));
    setPreference('fontScale', fontSteps[next]);
  };

  const btn = (disabled) => ({
    background: 'var(--surface-2)',
    color: disabled ? 'var(--text-faint)' : 'var(--text)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    width: 36,
    height: 36,
    fontSize: '1rem',
    cursor: disabled ? 'not-allowed' : 'pointer'
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <button type="button" style={btn(atMin)} disabled={atMin} onClick={() => step(-1)} aria-label="Decrease text size">A-</button>
      <span aria-live="polite" style={{ minWidth: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
        {Math.round(preferences.fontScale * 100)}%
      </span>
      <button type="button" style={btn(atMax)} disabled={atMax} onClick={() => step(1)} aria-label="Increase text size">A+</button>
    </div>
  );
};

const PreferencesPanel = ({ title = 'Appearance & Accessibility' }) => {
  const { preferences, resolvedTheme, reset } = usePreferences();

  return (
    <section style={card} aria-labelledby="preferences-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
        <h3 id="preferences-heading" style={{ margin: 0, color: 'var(--text)' }}>{title}</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
          {preferences.theme === 'auto' ? `Following system (${resolvedTheme})` : `Theme: ${resolvedTheme}`}
        </span>
      </div>

      <Row label="Theme" hint="Light, dark, or follow the device setting." control={<Select setting="theme" value={preferences.theme} />} />
      <Row label="Text size" hint="Scales text across the portal." control={<FontSizeControl />} />
      <Row label="Contrast" hint="Stronger borders and text for low-vision use." control={<Select setting="contrast" value={preferences.contrast} />} />
      <Row label="Colour vision" hint="Adjusts the colours used for pass/fail and status." control={<Select setting="cvd" value={preferences.cvd} />} />
      <Row label="Motion" hint="Reduce animations and transitions." control={<Select setting="reducedMotion" value={preferences.reducedMotion} />} />

      <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px',
            cursor: 'pointer'
          }}
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
};

export default PreferencesPanel;
