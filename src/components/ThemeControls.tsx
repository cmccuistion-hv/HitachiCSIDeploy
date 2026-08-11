import type { ThemeMode, ThemePalette } from '../state/ThemeContext'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M18.5 14.2A7.3 7.3 0 0 1 9.8 5.5 7.4 7.4 0 1 0 18.5 14.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ThemeControls({
  palette,
  mode,
  onPalette,
  onToggleMode,
}: {
  palette: ThemePalette
  mode: ThemeMode
  onPalette: (palette: ThemePalette) => void
  onToggleMode: () => void
}) {
  return (
    <div className="theme-controls" role="group" aria-label="Theme">
      <div className="theme-swatches" role="radiogroup" aria-label="Color palette">
        <button
          type="button"
          className={`theme-icon-btn${palette === 'coe' ? ' active' : ''}`}
          role="radio"
          aria-checked={palette === 'coe'}
          title="COE palette"
          aria-label="COE palette"
          onClick={() => onPalette('coe')}
        >
          <span className="theme-swatch theme-swatch-coe" />
        </button>
        <button
          type="button"
          className={`theme-icon-btn${palette === 'blue' ? ' active' : ''}`}
          role="radio"
          aria-checked={palette === 'blue'}
          title="Blue palette"
          aria-label="Blue palette"
          onClick={() => onPalette('blue')}
        >
          <span className="theme-swatch theme-swatch-blue" />
        </button>
      </div>
      <button
        type="button"
        className="theme-icon-btn"
        onClick={onToggleMode}
        title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  )
}
