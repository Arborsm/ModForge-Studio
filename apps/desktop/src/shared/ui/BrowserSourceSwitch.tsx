import { cx } from '@shared/lib/helper'

type BrowserSourceMode = 'original' | 'mod'

type BrowserSourceSwitchProps = {
  value: BrowserSourceMode
  onChange: (value: BrowserSourceMode) => void
}

export function BrowserSourceSwitch({ value, onChange }: BrowserSourceSwitchProps) {
  return (
    <div className="border-border-subtle bg-surface-panel-muted inline-flex rounded-lg border p-0.5">
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
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              isActive ? 'bg-surface-panel text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
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
