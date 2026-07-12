import { useEffect, useState } from 'react'
import type { DraftPatch } from '@features/cp-maker'
import type { EditorComponent } from '../model/workspaceRegistry'
import { useEditorCopy } from '@locales/provider'

const ACTIONS: DraftPatch['action'][] = ['EditData', 'EditImage', 'EditMap', 'Load', 'Include']

function formatState(value: unknown) {
  return `${JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? value : {}, null, 2)}\n`
}

/** Generic Content Patcher change editor used by the project-content module. */
export const GenericPatchEditor: EditorComponent = ({ patch, onPatchChange }) => {
  const desk = useEditorCopy().studioDesk
  const copy = desk.editorPage
  const [jsonText, setJsonText] = useState(() => formatState(patch.editorState))
  const [jsonError, setJsonError] = useState(false)

  useEffect(() => {
    setJsonText(formatState(patch.editorState))
    setJsonError(false)
  }, [patch.id])

  const handleJsonChange = (value: string) => {
    setJsonText(value)
    try {
      const parsed = JSON.parse(value) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
      setJsonError(false)
      onPatchChange(patch.id, { editorState: parsed })
    } catch {
      setJsonError(true)
    }
  }

  return (
    <div className="custom-scrollbar h-full overflow-auto bg-(--bg-app) p-5">
      <div className="mx-auto grid max-w-4xl gap-4">
        <label className="grid gap-1.5 text-xs text-(--text-secondary)">
          <span>{copy.patchName}</span>
          <input
            className="control-input"
            value={patch.logName}
            onChange={(event) => onPatchChange(patch.id, { logName: event.target.value })}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs text-(--text-secondary)">
            <span>{desk.patchCatalog.action}</span>
            <select
              className="control-select"
              value={patch.action}
              onChange={(event) => onPatchChange(patch.id, { action: event.target.value as DraftPatch['action'] })}
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
              onChange={(event) => onPatchChange(patch.id, { target: event.target.value })}
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs text-(--text-secondary)">
          <span>{desk.patchCatalog.fromFile}</span>
          <input
            className="control-input"
            value={patch.fromFile ?? ''}
            onChange={(event) => onPatchChange(patch.id, { fromFile: event.target.value || undefined })}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
          <input
            type="checkbox"
            checked={patch.enabled === true}
            onChange={(event) => onPatchChange(patch.id, { enabled: event.target.checked })}
          />
          <span>{copy.enabled}</span>
        </label>
        <label className="grid gap-1.5 text-xs text-(--text-secondary)">
          <span>{copy.editorStateJson}</span>
          <textarea
            className="control-textarea min-h-96 font-mono text-xs"
            value={jsonText}
            spellCheck={false}
            aria-invalid={jsonError}
            onChange={(event) => handleJsonChange(event.target.value)}
          />
          {jsonError ? <span className="text-(--danger)">{copy.invalidJson}</span> : null}
        </label>
      </div>
    </div>
  )
}
