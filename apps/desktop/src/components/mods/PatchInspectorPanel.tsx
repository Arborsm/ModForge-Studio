import { useEffect, useMemo, useRef } from 'react'
import { FileJson2, Sparkles } from 'lucide-react'
import type { ContentPatcherCanvasNode } from '../../lib/plugins/contentPatcher'
import { stringifyPrettyJson } from '../../lib/plugins/contentPatcher'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'

type PatchFocusTarget = 'action' | 'target' | 'fromFile' | 'when'

type PatchInspectorPanelProps = {
  copy: ModWorkspaceCopy
  selectedPatch: Record<string, unknown> | null
  selectedPatchStatus?: {
    status: 'applied' | 'skipped' | 'indeterminate'
    reasons: string[]
  } | null
  patchWhenError: string | null
  onPatchFieldChange: (field: string, value: string) => void
  onPatchWhenChange: (value: string) => void
  focusField?: PatchFocusTarget | null
  onFocusResolved?: () => void
  selectedNode?: ContentPatcherCanvasNode | null
  patchPreview?: string
}

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readStringField(value: Record<string, unknown> | null, field: string) {
  return value && typeof value[field] === 'string' ? String(value[field]) : ''
}

function readNumberField(value: JsonObject, field: string) {
  const raw = value[field]
  return typeof raw === 'number' ? raw : null
}

function getActionToneClass(action: string) {
  switch (action.toLowerCase()) {
    case 'load':
      return 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
    case 'editimage':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-200'
    case 'editdata':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
    case 'editmap':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-200'
    case 'include':
      return 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200'
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-primary)]'
  }
}

export function PatchInspectorPanel({
  copy,
  selectedPatch,
  selectedPatchStatus,
  patchWhenError,
  onPatchFieldChange,
  onPatchWhenChange,
  focusField,
  onFocusResolved,
  selectedNode,
  patchPreview,
}: PatchInspectorPanelProps) {
  const actionRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<HTMLInputElement>(null)
  const fromFileRef = useRef<HTMLInputElement>(null)
  const whenRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!selectedPatch || !focusField) {
      return
    }

    const focusTargets: Record<PatchFocusTarget, { current: HTMLElement | null }> = {
      action: actionRef,
      target: targetRef,
      fromFile: fromFileRef,
      when: whenRef,
    }

    const element = focusTargets[focusField]?.current
    if (!element) {
      return
    }

    element.focus()
    onFocusResolved?.()
  }, [focusField, onFocusResolved, selectedPatch])

  const patchJson = useMemo(() => {
    if (!patchPreview) {
      return null
    }
    try {
      const parsed = JSON.parse(patchPreview)
      return isJsonObject(parsed) ? parsed : null
    } catch {
      return null
    }
  }, [patchPreview])

  if (!selectedNode) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{copy.inspectorTitle}</p>
        <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{copy.noPatch}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Select a node on the canvas to inspect its parameters.
        </p>
      </div>
    )
  }

  const whenText = selectedPatch?.When ? stringifyPrettyJson(selectedPatch.When).trimEnd() : ''
  const action = selectedPatch ? readStringField(selectedPatch, 'Action') : ''
  const target = selectedPatch ? readStringField(selectedPatch, 'Target') : ''
  const fromFile = selectedPatch ? readStringField(selectedPatch, 'FromFile') : ''
  const logName = selectedPatch ? readStringField(selectedPatch, 'LogName') : selectedNode.data.label

  const toArea = patchJson && isJsonObject(patchJson.ToArea) ? patchJson.ToArea : null
  const toAreaWidth = toArea ? readNumberField(toArea, 'Width') ?? readNumberField(toArea, 'W') : null
  const toAreaHeight = toArea ? readNumberField(toArea, 'Height') ?? readNumberField(toArea, 'H') : null

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{copy.inspectorTitle}</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{logName || copy.noPatch}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{target || selectedNode.data.label}</p>
          </div>
          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${getActionToneClass(action)}`}>
            {action || selectedNode.kind}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            <Sparkles className="h-4 w-4" />
            Node Status
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {selectedNode.data.simulation?.isActive === false
              ? 'Simulation marks this node as inactive for the current filters.'
              : selectedNode.data.simulation?.hasUnknownConditions
                ? 'Simulation cannot fully evaluate this node yet.'
                : 'Simulation indicates this node is active.'}
          </p>
        </div>

        {selectedPatchStatus ? (
          <div className="mt-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              Backend Status
            </div>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedPatchStatus.status}</p>
            {selectedPatchStatus.reasons.map((reason) => (
              <p key={reason} className="mt-1 text-xs text-[var(--text-secondary)]">
                {reason}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {selectedNode.kind === 'action' && selectedPatch ? (
        <section className="grid gap-3">
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchLogName}</span>
            <input className="control-input" value={logName} onChange={(event) => onPatchFieldChange('LogName', event.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchAction}</span>
            <input
              ref={actionRef}
              className="control-input"
              value={action}
              onChange={(event) => onPatchFieldChange('Action', event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchTarget}</span>
            <input
              ref={targetRef}
              className="control-input"
              value={target}
              onChange={(event) => onPatchFieldChange('Target', event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchFromFile}</span>
            <input
              ref={fromFileRef}
              className="control-input"
              value={fromFile}
              onChange={(event) => onPatchFieldChange('FromFile', event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="panel-section-title">{copy.patchWhenLabel}</span>
            <textarea
              ref={whenRef}
              className="control-input min-h-40 resize-y font-mono text-xs"
              value={whenText}
              onChange={(event) => onPatchWhenChange(event.target.value)}
              spellCheck={false}
            />
          </label>
          {patchWhenError ? <p className="text-sm text-[var(--danger)]">{patchWhenError}</p> : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4 text-sm text-[var(--text-secondary)]">
          <p><strong className="text-[var(--text-primary)]">Node:</strong> {selectedNode.data.label}</p>
          {selectedNode.data.assetPath ? <p className="mt-2"><strong className="text-[var(--text-primary)]">Asset:</strong> {selectedNode.data.assetPath}</p> : null}
          {selectedNode.data.target ? <p className="mt-2"><strong className="text-[var(--text-primary)]">Target:</strong> {selectedNode.data.target}</p> : null}
          {selectedNode.data.whenKey ? <p className="mt-2"><strong className="text-[var(--text-primary)]">When:</strong> {selectedNode.data.whenKey}</p> : null}
        </section>
      )}

      {toArea ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            <FileJson2 className="h-4 w-4" />
            ToArea
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">X</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{readNumberField(toArea, 'X') ?? '-'}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Y</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{readNumberField(toArea, 'Y') ?? '-'}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">W</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{toAreaWidth ?? '-'}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">H</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">{toAreaHeight ?? '-'}</p>
            </div>
          </div>
        </section>
      ) : null}

      {patchPreview ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            <FileJson2 className="h-4 w-4" />
            Raw Patch JSON
          </div>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-secondary)]">
            {patchPreview}
          </pre>
        </section>
      ) : null}
    </div>
  )
}
