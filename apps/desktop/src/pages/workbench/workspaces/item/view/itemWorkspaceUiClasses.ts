import type { Tone } from './itemWorkspaceTypes'

export function getToneClass(tone: Tone) {
  switch (tone) {
    case 'positive':
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
    case 'danger':
      return 'border-rose-400/25 bg-rose-500/10 text-rose-200'
    case 'accent':
      return 'border-[color-mix(in_srgb,var(--accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--text-primary)]'
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-primary)]'
  }
}

export function getPillClass(isActive: boolean) {
  return isActive
    ? 'border-transparent bg-[var(--accent)] text-white shadow-[0_12px_28px_color-mix(in_srgb,var(--accent)_28%,transparent)]'
    : 'border-[var(--border-color)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
}
