import { cx } from '@shared/lib/cx'
import type { BrowserSourceMode } from '@shared/contracts'

type BrowserSourceSwitchProps = {
  value: BrowserSourceMode
  onChange: (value: BrowserSourceMode) => void
}

export function BrowserSourceSwitch({ value, onChange }: BrowserSourceSwitchProps) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
      {(
        [
          ['original', 'Original'],
          ['mod', 'Mod'],
        ] as const
      ).map(([mode, label]) => {
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            className={cx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-[var(--accent)] text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--accent)_24%,transparent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => onChange(mode)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
