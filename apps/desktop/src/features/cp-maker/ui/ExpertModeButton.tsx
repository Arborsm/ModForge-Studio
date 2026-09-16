/**
 * @file Shared icon-only toggle button for the global beginner/expert
 * authoring preference.
 * @module features/cp-maker
 */
import { Wrench } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useAuthoringShellCopy } from '@locales/provider'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'

/** Shared icon-only button controlling the global beginner/expert authoring preference. */
export function ExpertModeButton() {
  const copy = useAuthoringShellCopy()
  const expertMode = usePreferencesStore((state) => state.expertMode)
  const setExpertMode = usePreferencesStore((state) => state.setExpertMode)

  return (
    <button
      type="button"
      className={cx('authoring-header-expert-toggle', expertMode && 'is-active')}
      title={copy.expertModeHint}
      aria-label={copy.expertMode}
      aria-pressed={expertMode}
      onClick={() => setExpertMode(!expertMode)}
    >
      <Wrench className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
