import { Wrench } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useAuthoringShellCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'

/** Shared icon button controlling the global beginner/expert authoring preference. */
export function ExpertModeButton() {
  const copy = useAuthoringShellCopy()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const setExpertMode = useEditorModeStore((state) => state.setExpertMode)

  return (
    <button
      type="button"
      className={cx('authoring-header-expert-toggle', expertMode && 'is-active')}
      title={copy.expertModeHint}
      aria-pressed={expertMode}
      onClick={() => setExpertMode(!expertMode)}
    >
      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{copy.expertMode}</span>
    </button>
  )
}
