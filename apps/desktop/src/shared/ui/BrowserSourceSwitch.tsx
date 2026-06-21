import { cx } from '@shared/lib/helper'

type BrowserSourceMode = 'original' | 'mod'

type BrowserSourceSwitchProps = {
  value: BrowserSourceMode
  onChange: (value: BrowserSourceMode) => void
}

export function BrowserSourceSwitch({ value, onChange }: BrowserSourceSwitchProps) {
  return (
    <div className="inline-flex rounded-full border border-(--border-color) bg-(--bg-panel) p-1">
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
                ? 'bg-(--accent) text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--accent)_24%,transparent)]'
                : 'text-(--text-secondary) hover:bg-(--bg-panel-muted) hover:text-(--text-primary)',
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
