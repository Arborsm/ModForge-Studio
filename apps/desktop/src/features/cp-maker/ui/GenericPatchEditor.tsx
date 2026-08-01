import { Code2, FileWarning, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAssetAuthoringCopy, useEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import type { DraftPatch } from '../model/types'
import type { EditorComponent } from '../model/workspaceRegistry'

const ACTIONS: DraftPatch['action'][] = ['EditData', 'EditImage', 'EditMap', 'Load', 'Include']

function formatState(value: unknown) {
  return `${JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? value : {}, null, 2)}\n`
}

/**
 * Fallback editor for patch targets without a registered `AssetSchema`.
 *
 * It edits patch metadata only; the raw `editorState` JSON stays behind an
 * explicit escape hatch so nobody lands in a bare textarea by accident.
 */
export const GenericPatchEditor: EditorComponent = ({ patch, draftPort }) => {
  const desk = useEditorCopy().studioDesk
  const copy = desk.editorPage
  const rawCopy = useAssetAuthoringCopy().raw
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const [rawOpen, setRawOpen] = useState(false)
  const [jsonText, setJsonText] = useState(() => formatState(patch.editorState))
  const [jsonError, setJsonError] = useState(false)

  useEffect(() => {
    setJsonText(formatState(patch.editorState))
    setJsonError(false)
    setRawOpen(false)
  }, [patch.id])

  function handleJsonChange(value: string) {
    setJsonText(value)
    try {
      const parsed = JSON.parse(value) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('object required')
      }
      setJsonError(false)
      draftPort.updatePatch(patch.id, { editorState: parsed })
    } catch {
      setJsonError(true)
    }
  }

  // Raw-JSON editing is an explicit expert-mode escape hatch: beginners see a
  // guidance panel instead of a bare form + textarea and are pointed at the
  // header toggle that unlocks it.
  if (!expertMode) {
    return (
      <div className="custom-scrollbar h-full overflow-auto bg-(--bg-app) p-5">
        <div className="mx-auto grid max-w-4xl gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-(--border-color) bg-(--bg-panel-muted) p-4">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-(--warning)" aria-hidden="true" />
            <div className="grid gap-1">
              <strong className="text-sm text-(--text-primary)">{copy.unsupportedAssetTitle}</strong>
              <p className="text-xs leading-relaxed text-(--text-secondary)">{copy.unsupportedAssetHint(patch.target)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-(--border-color) bg-(--bg-panel-muted) p-4">
            <Code2 className="mt-0.5 h-5 w-5 shrink-0 text-(--text-secondary)" aria-hidden="true" />
            <div className="grid gap-1">
              <strong className="text-sm text-(--text-primary)">{rawCopy.expertOnlyTitle}</strong>
              <p className="text-xs leading-relaxed text-(--text-secondary)">{rawCopy.expertOnlyHint}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="custom-scrollbar h-full overflow-auto bg-(--bg-app) p-5">
      <div className="mx-auto grid max-w-4xl gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-(--border-color) bg-(--bg-panel-muted) p-4">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-(--warning)" aria-hidden="true" />
          <div className="grid gap-1">
            <strong className="text-sm text-(--text-primary)">{copy.unsupportedAssetTitle}</strong>
            <p className="text-xs leading-relaxed text-(--text-secondary)">{copy.unsupportedAssetHint(patch.target)}</p>
          </div>
        </div>

        <label className="grid gap-1.5 text-xs text-(--text-secondary)">
          <span>{copy.patchName}</span>
          <input
            className="control-input"
            value={patch.logName}
            onChange={(event) => draftPort.updatePatch(patch.id, { logName: event.target.value })}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-(--text-secondary)">
            <span>{desk.patchCatalog.action}</span>
            <select
              className="control-select"
              value={patch.action}
              onChange={(event) => draftPort.updatePatch(patch.id, { action: event.target.value as DraftPatch['action'] })}
            >
              {ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {desk.addPatchDialog.actionLabels[action]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-(--text-secondary)">
            <span>{desk.patchCatalog.target}</span>
            <input
              className="control-input"
              value={patch.target}
              disabled={patch.action === 'Include'}
              onChange={(event) => draftPort.updatePatch(patch.id, { target: event.target.value })}
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs text-(--text-secondary)">
          <span>{desk.patchCatalog.fromFile}</span>
          <input
            className="control-input"
            value={patch.fromFile ?? ''}
            onChange={(event) => draftPort.updatePatch(patch.id, { fromFile: event.target.value || undefined })}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
          <input
            type="checkbox"
            checked={patch.enabled === true}
            onChange={(event) => draftPort.updatePatch(patch.id, { enabled: event.target.checked })}
          />
          <span>{copy.enabled}</span>
        </label>

        {rawOpen ? (
          <section className="grid gap-1.5 text-xs text-(--text-secondary)">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-(--text-primary)">{rawCopy.title}</span>
              <button type="button" className="control-button" onClick={() => setRawOpen(false)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{rawCopy.closeAction}</span>
              </button>
            </div>
            <p>{rawCopy.hint}</p>
            <textarea
              className="control-textarea min-h-96 font-mono text-xs"
              value={jsonText}
              spellCheck={false}
              aria-invalid={jsonError}
              aria-label={rawCopy.title}
              onChange={(event) => handleJsonChange(event.target.value)}
            />
            {jsonError ? <span className="text-(--danger)">{rawCopy.invalidJson}</span> : null}
          </section>
        ) : (
          <button type="button" className="control-button justify-self-start" onClick={() => setRawOpen(true)}>
            <Code2 className="h-4 w-4" aria-hidden="true" />
            <span>{rawCopy.openAction}</span>
          </button>
        )}
      </div>
    </div>
  )
}
