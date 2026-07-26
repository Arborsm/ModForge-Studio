import { useTranslation } from 'react-i18next'
import type { ResolvedInstallerTheme } from '../theme/useInstallerTheme'

interface ThemeToggleProps {
  resolvedTheme: ResolvedInstallerTheme
  onToggle: () => void
}

/** Titlebar day/night switch — sun shows in dark mode (switch to light), moon in light mode. */
export function ThemeToggle({ resolvedTheme, onToggle }: ThemeToggleProps) {
  const { t } = useTranslation()
  const label = t(resolvedTheme === 'dark' ? 'theme.switchToLight' : 'theme.switchToDark')

  return (
    <button className="window-controls__btn theme-toggle" onClick={onToggle} aria-label={label} title={label}>
      {resolvedTheme === 'dark' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4.5" />
          <line x1="12" y1="19.5" x2="12" y2="22" />
          <line x1="2" y1="12" x2="4.5" y2="12" />
          <line x1="19.5" y1="12" x2="22" y2="12" />
          <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
          <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
          <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
          <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
