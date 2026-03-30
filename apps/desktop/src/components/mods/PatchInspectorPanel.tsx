import { FileJson2, Sparkles } from 'lucide-react'
import { stringifyPrettyJson } from '../../lib/plugins/contentPatcher'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'

type PatchInspectorPanelProps = {
  copy: ModWorkspaceCopy
  selectedPatch: Record<string, unknown> | null
  patchWhenError: string | null
  onPatchFieldChange: (field: string, value: string) => void
  onPatchWhenChange: (value: string) => void
}

function readStringField(value: Record<string, unknown> | null, field: string) {
  return value && typeof value[field] === 'string' ? String(value[field]) : ''
}

function getActionToneClass(action: string) {
  switch (action.toLowerCase()) {
    case 'load':
      return 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
    case 'editimage':
      return 'border-sky-400/35 bg-sky-500/10 text-sky-100'
    case 'editdata':
      return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
    case 'editmap':
      return 'border-amber-400/35 bg-amber-500/10 text-amber-100'
    case 'include':
      return 'border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-100'
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-primary)]'
  }
}

export function PatchInspectorPanel({
  copy,
  selectedPatch,
  patchWhenError,
  onPatchFieldChange,
  onPatchWhenChange,
}: PatchInspectorPanelProps) {
  if (!selectedPatch) {
    return <div className="panel-empty-state h-full">{copy.noPatch}</div>
  }

  const whenText = selectedPatch.When ? stringifyPrettyJson(selectedPatch.When).trimEnd() : ''
  const action = readStringField(selectedPatch, 'Action')
  const target = readStringField(selectedPatch, 'Target')
  const fromFile = readStringField(selectedPatch, 'FromFile')
  const logName = readStringField(selectedPatch, 'LogName')

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-[var(--bg-panel)] p-3">
      <section className="rounded-[28px] border border-[var(--border-color)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--accent)_8%,var(--bg-panel)))] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{copy.inspectorTitle}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{logName || copy.noPatch}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {target || copy.noTargetLabel}
            </p>
          </div>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getActionToneClass(action)}`}>
            {action || copy.unknownLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-2">
          <div className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.patchFromFile}</p>
            <p className="mt-2 break-all text-sm text-[var(--text-primary)]">{fromFile || copy.unknownLabel}</p>
          </div>
          <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-app))] px-3 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              <Sparkles className="h-4 w-4" />
              Editable Patch Fields
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              Keep structured fields here, and use the raw JSON panel below when a patch needs low-level edits.
            </p>
          </div>
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-section-body grid gap-3">
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchLogName}</span>
            <input className="control-input" value={logName} onChange={(event) => onPatchFieldChange('LogName', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchAction}</span>
            <input className="control-input" value={action} onChange={(event) => onPatchFieldChange('Action', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchTarget}</span>
            <input className="control-input" value={target} onChange={(event) => onPatchFieldChange('Target', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchFromFile}</span>
            <input className="control-input" value={fromFile} onChange={(event) => onPatchFieldChange('FromFile', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchWhenLabel}</span>
            <textarea className="control-input min-h-48 resize-y font-mono text-xs" value={whenText} onChange={(event) => onPatchWhenChange(event.target.value)} spellCheck={false} />
          </label>
          {patchWhenError ? <p className="text-xs text-[var(--danger)]">{patchWhenError}</p> : null}
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          <FileJson2 className="h-4 w-4" />
          Raw Patch JSON
        </div>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-secondary)]">
          {JSON.stringify(selectedPatch, null, 2)}
        </pre>
      </section>
    </div>
  )
}
