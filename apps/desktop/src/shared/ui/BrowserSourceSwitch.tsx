import { cx } from '@shared/lib/helper'

type BrowserSourceMode = 'original' | 'mod'

type BrowserSourceSwitchProps = {
  value: BrowserSourceMode
  onChange: (value: BrowserSourceMode) => void
}

export function BrowserSourceSwitch({ value, onChange }: BrowserSourceSwitchProps) {
  return (
    <div className="inline-flex rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-0.5">
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
              isActive ? 'bg-(--bg-panel) text-(--text-primary) shadow-sm' : 'text-(--text-secondary) hover:text-(--text-primary)',
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
