import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileImage,
  FileJson2,
  FolderTree,
  GitBranchPlus,
  Search,
  Sparkles,
} from 'lucide-react'
import { loadImageDataUrl, type ModProjectDetail, type ModProjectDiagnostic, type SaveModProjectResult } from '../../lib/desktop'
import { ensureJsonObject, stringifyPrettyJson } from '../../lib/plugins/contentPatcher'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'
import type { WorkspacePluginDefinition } from '../../lib/plugins/types'

type PatchSummary = {
  id: string
  action: string
  target: string
  fromFile: string | null
  logName: string
  hasWhen: boolean
  whenKeys: string[]
  updateKeys: string[]
}

type ContentPatcherWorkspaceProps = {
  copy: ModWorkspaceCopy
  pluginDefinition: WorkspacePluginDefinition | null
  projectDetail: ModProjectDetail | null
  diagnostics: ModProjectDiagnostic[]
  statusMessage: string
  lastSaveResult: SaveModProjectResult | null
  gameRootPath: string | null
  manifestEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  contentEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  contentSummary: {
    format: string | null
    changeCount: number
    includeCount: number
    dynamicTokenCount: number
    configKeys: string[]
    patches: PatchSummary[]
  }
  selectedPatchId: string | null
  selectedPatch: Record<string, unknown> | null
  patchWhenError: string | null
  hasUnsavedChanges: boolean
  canPersist: boolean
  onSelectPatch: (patchId: string) => void
  onManifestFieldChange: (field: string, value: string) => void
  onManifestTextChange: (value: string) => void
  onContentTextChange: (value: string) => void
  onPatchFieldChange: (field: string, value: string) => void
  onPatchWhenChange: (value: string) => void
  onAddPatch: () => void
  onRemoveSelectedPatch: () => void
  onSaveProject: () => void
  onExportProject: () => void
}

type PreviewState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  dataUrl: string | null
  resolvedPath: string | null
  message: string
}

type WorkspaceView = 'overview' | 'patches' | 'json' | 'diagnostics'

function readStringField(value: unknown, field: string) {
  const record = ensureJsonObject(value)
  return typeof record[field] === 'string' ? String(record[field]) : ''
}

function readPatchEntries(patch: Record<string, unknown> | null) {
  return Object.keys(ensureJsonObject(patch?.Entries))
}

function formatTargetTokens(target: string) {
  return target
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeFsPath(value: string) {
  return value.trim().replaceAll('/', '\\')
}

function isAbsoluteFsPath(value: string) {
  return /^[a-z]:\\/i.test(value) || value.startsWith('\\\\')
}

function joinFsPath(basePath: string, childPath: string) {
  const normalizedChild = normalizeFsPath(childPath)
  if (isAbsoluteFsPath(normalizedChild)) {
    return normalizedChild
  }

  const normalizedBase = normalizeFsPath(basePath).replace(/[\\]+$/, '')
  const trimmedChild = normalizedChild.replace(/^[\\]+/, '')
  return `${normalizedBase}\\${trimmedChild}`
}

function getPathExtension(value: string) {
  const normalized = normalizeFsPath(value)
  const segment = normalized.split('\\').pop() ?? normalized
  const markerIndex = segment.lastIndexOf('.')
  return markerIndex >= 0 ? segment.slice(markerIndex).toLowerCase() : ''
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function buildPreviewCandidates(path: string) {
  const normalized = normalizeFsPath(path)
  const extension = getPathExtension(normalized)
  if (extension === '.tmx' || extension === '.json') {
    return [] as string[]
  }

  if (!extension) {
    return [`${normalized}.png`, `${normalized}.xnb`, `${normalized}.jpg`, `${normalized}.jpeg`, `${normalized}.webp`]
  }

  if (extension === '.png') {
    return [normalized, normalized.slice(0, -4) + '.xnb']
  }

  if (extension === '.xnb') {
    return [normalized, normalized.slice(0, -4) + '.png']
  }

  return [normalized]
}

function resolveGameAssetCandidates(target: string, gameRootPath: string | null) {
  if (!target || !gameRootPath) {
    return [] as string[]
  }

  return uniqueStrings(
    formatTargetTokens(target).flatMap((token) => {
      const normalizedTarget = normalizeFsPath(token)
      const lowerTarget = normalizedTarget.toLowerCase()
      if (!normalizedTarget) {
        return []
      }

      if (lowerTarget.startsWith('data\\') || lowerTarget.startsWith('maps\\') || lowerTarget.startsWith('mods\\')) {
        return []
      }

      const rootedTarget = lowerTarget.startsWith('content\\')
        ? joinFsPath(gameRootPath, normalizedTarget)
        : joinFsPath(joinFsPath(gameRootPath, 'Content'), normalizedTarget)

      return buildPreviewCandidates(rootedTarget)
    }),
  )
}

function resolveModResultCandidates(summary: PatchSummary | null, projectDetail: ModProjectDetail | null) {
  if (!summary?.fromFile || !projectDetail?.summary.absolutePath) {
    return [] as string[]
  }

  return uniqueStrings(buildPreviewCandidates(joinFsPath(projectDetail.summary.absolutePath, summary.fromFile)))
}

async function loadFirstPreview(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      const dataUrl = await loadImageDataUrl(candidate)
      return { dataUrl, resolvedPath: candidate }
    } catch {
      continue
    }
  }

  return null
}

function usePreviewImage(candidates: string[], emptyMessage: string) {
  const emptyState = useMemo<PreviewState>(() => ({
    status: 'idle',
    dataUrl: null,
    resolvedPath: null,
    message: emptyMessage,
  }), [emptyMessage])
  const [state, setState] = useState<(PreviewState & { key: string }) | null>(null)
  const uniqueCandidates = useMemo(() => uniqueStrings(candidates), [candidates])
  const requestKey = uniqueCandidates.join('|')

  useEffect(() => {
    let cancelled = false

    if (!uniqueCandidates.length) {
      return () => {
        cancelled = true
      }
    }

    void loadFirstPreview(uniqueCandidates)
      .then((result) => {
        if (cancelled) {
          return
        }

        if (result) {
          setState({
            key: requestKey,
            status: 'ready',
            dataUrl: result.dataUrl,
            resolvedPath: result.resolvedPath,
            message: '',
          })
          return
        }

        setState({
          key: requestKey,
          status: 'error',
          dataUrl: null,
          resolvedPath: null,
          message: emptyMessage,
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setState({
          key: requestKey,
          status: 'error',
          dataUrl: null,
          resolvedPath: null,
          message: error instanceof Error ? error.message : emptyMessage,
        })
      })

    return () => {
      cancelled = true
    }
  }, [emptyMessage, requestKey, uniqueCandidates])

  if (!requestKey) {
    return emptyState
  }

  if (!state || state.key !== requestKey) {
    return {
      status: 'loading',
      dataUrl: null,
      resolvedPath: null,
      message: 'Loading preview...',
    } satisfies PreviewState
  }

  return state
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

function formatPatchOutput(summary: PatchSummary, patch: Record<string, unknown> | null, copy: ModWorkspaceCopy) {
  const targets = formatTargetTokens(summary.target)
  const entries = readPatchEntries(patch)

  switch (summary.action.toLowerCase()) {
    case 'load':
      return {
        title: targets[0] ? `Load into ${targets[0]}` : 'Load asset output',
        detail: summary.fromFile ? `Import ${summary.fromFile}` : 'Inject an external asset into the target pipeline.',
      }
    case 'editimage':
      return {
        title: targets[0] ? `Composite ${targets[0]}` : 'Edit image output',
        detail: summary.fromFile ? `Render pixels from ${summary.fromFile}` : 'Apply pixel-region edits to the selected texture asset.',
      }
    case 'editdata':
      return {
        title: targets[0] ? `Rewrite ${targets[0]}` : 'Edit data asset',
        detail: entries.length
          ? `Update ${entries.length} entries: ${entries.slice(0, 4).join(', ')}${entries.length > 4 ? '...' : ''}`
          : 'Apply record or field mutations to the selected data asset.',
      }
    case 'editmap':
      return {
        title: targets[0] ? `Patch map ${targets[0]}` : 'Patch map output',
        detail: summary.fromFile ? `Apply map instructions from ${summary.fromFile}` : 'Modify map layers, tiles, or warps for the target map.',
      }
    case 'include':
      return {
        title: 'Expand nested patch file',
        detail: summary.fromFile ? `Pull additional patch nodes from ${summary.fromFile}` : 'Expand nested patch definitions.',
      }
    default:
      return {
        title: summary.target || copy.noTargetLabel,
        detail: summary.fromFile ? `Source file: ${summary.fromFile}` : 'Apply this patch action to the selected target.',
      }
  }
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-[color-mix(in_srgb,var(--accent)_36%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-panel))] text-[var(--text-primary)]'
          : 'border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--accent)_24%,transparent)] hover:text-[var(--text-primary)]'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'accent'
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-app))]'
      : 'border-[var(--border-color)] bg-[var(--bg-app)]'

  return (
    <div className={`rounded-[22px] border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function PreviewImageCard({
  title,
  subtitle,
  preview,
}: {
  title: string
  subtitle: string
  preview: PreviewState
}) {
  return (
    <div className="rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        <FileImage className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{subtitle}</p>

      {preview.status === 'ready' && preview.dataUrl ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_80%,transparent)]">
          <img src={preview.dataUrl} alt={title} className="max-h-72 w-full object-contain" />
        </div>
      ) : (
        <div className="mt-3 flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_80%,transparent)] px-4 text-center text-sm text-[var(--text-secondary)]">
          {preview.message}
        </div>
      )}

      <p className="mt-3 break-all text-[11px] leading-5 text-[var(--text-tertiary)]">
        {preview.resolvedPath ?? 'No resolved preview file'}
      </p>
    </div>
  )
}

function DiagnosticList({
  diagnostics,
  emptyLabel,
}: {
  diagnostics: ModProjectDiagnostic[]
  emptyLabel: string
}) {
  if (!diagnostics.length) {
    return <div className="panel-empty-state">{emptyLabel}</div>
  }

  return (
    <div className="space-y-2">
      {diagnostics.map((diagnostic, index) => {
        const tone =
          diagnostic.severity === 'error'
            ? 'border-red-400/25 bg-red-500/10 text-red-50'
            : diagnostic.severity === 'warning'
              ? 'border-amber-400/25 bg-amber-500/10 text-amber-50'
              : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-50'

        return (
          <div key={`${diagnostic.field ?? 'global'}:${index}`} className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{diagnostic.message}</p>
                {diagnostic.field ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{diagnostic.field}</p> : null}
              </div>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${tone}`}>
                {diagnostic.severity}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PatchListItem({
  patch,
  active,
  onClick,
}: {
  patch: PatchSummary
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-[24px] border p-4 text-left transition ${
        active
          ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_14%,var(--bg-panel)),color-mix(in_srgb,var(--bg-elevated)_94%,transparent))] shadow-[var(--shadow-panel)]'
          : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_24%,transparent)] hover:bg-[var(--bg-elevated)]'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {patch.logName || patch.target || patch.id}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
            {patch.target || 'No target selected'}
          </p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getActionToneClass(patch.action)}`}>
          {patch.action}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {patch.whenKeys.length ? (
          <span className="dock-chip">{patch.whenKeys.slice(0, 2).join(', ')}{patch.whenKeys.length > 2 ? ` +${patch.whenKeys.length - 2}` : ''}</span>
        ) : (
          <span className="dock-chip">Always</span>
        )}
        {patch.fromFile ? <span className="dock-chip">{patch.fromFile}</span> : null}
      </div>
    </button>
  )
}

export function ContentPatcherWorkspace({
  copy,
  pluginDefinition,
  projectDetail,
  diagnostics,
  statusMessage,
  lastSaveResult,
  gameRootPath,
  manifestEditor,
  contentEditor,
  contentSummary,
  selectedPatchId,
  selectedPatch,
  patchWhenError,
  hasUnsavedChanges,
  canPersist,
  onSelectPatch,
  onManifestFieldChange,
  onManifestTextChange,
  onContentTextChange,
  onPatchFieldChange,
  onPatchWhenChange,
  onAddPatch,
  onRemoveSelectedPatch,
  onSaveProject,
  onExportProject,
}: ContentPatcherWorkspaceProps) {
  const [view, setView] = useState<WorkspaceView>('overview')
  const [patchQuery, setPatchQuery] = useState('')
  const deferredPatchQuery = useDeferredValue(patchQuery.trim().toLowerCase())

  const manifest = ensureJsonObject(manifestEditor.value)
  const contentPackFor = ensureJsonObject(manifest.ContentPackFor)
  const selectedPatchSummary = contentSummary.patches.find((patch) => patch.id === selectedPatchId) ?? contentSummary.patches[0] ?? null
  const selectedPatchEntries = readPatchEntries(selectedPatch)
  const selectedPatchTargets = selectedPatchSummary ? formatTargetTokens(selectedPatchSummary.target) : []
  const selectedPatchPreview = selectedPatchSummary ? formatPatchOutput(selectedPatchSummary, selectedPatch, copy) : null
  const filteredPatches = useMemo(
    () =>
      contentSummary.patches.filter((patch) => {
        if (!deferredPatchQuery) {
          return true
        }

        const haystack = [patch.logName, patch.target, patch.action, patch.fromFile ?? '', patch.whenKeys.join(' ')].join(' ').toLowerCase()
        return haystack.includes(deferredPatchQuery)
      }),
    [contentSummary.patches, deferredPatchQuery],
  )
  const selectedPatchVisible = selectedPatchSummary ? filteredPatches.some((patch) => patch.id === selectedPatchSummary.id) : false

  const selectedSourcePreview = usePreviewImage(
    selectedPatchSummary ? resolveGameAssetCandidates(selectedPatchSummary.target, gameRootPath) : [],
    'The original asset cannot be rendered as an image preview.',
  )
  const selectedResultPreview = usePreviewImage(
    resolveModResultCandidates(selectedPatchSummary, projectDetail),
    'This patch does not expose a direct previewable result file.',
  )
  const manifestName = readStringField(manifest, 'Name')
  const manifestAuthor = readStringField(manifest, 'Author')
  const manifestVersion = readStringField(manifest, 'Version')
  const manifestUniqueId = readStringField(manifest, 'UniqueID')
  const manifestDescription = readStringField(manifest, 'Description')
  const whenText = selectedPatch?.When ? stringifyPrettyJson(selectedPatch.When).trimEnd() : ''
  const action = readStringField(selectedPatch, 'Action')
  const target = readStringField(selectedPatch, 'Target')
  const fromFile = readStringField(selectedPatch, 'FromFile')
  const logName = readStringField(selectedPatch, 'LogName')

  if (!projectDetail?.contentPatcher) {
    return <div className="panel-empty-state h-full">{copy.noProject}</div>
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_94%,transparent),color-mix(in_srgb,var(--bg-app)_92%,transparent))] p-4">
      <section className="rounded-[32px] border border-[var(--border-color)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-elevated)_96%,transparent),color-mix(in_srgb,var(--accent)_10%,var(--bg-panel)))] p-5 shadow-[var(--shadow-panel)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-app))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                Mods Studio
              </span>
              <span className={`status-pill ${hasUnsavedChanges ? 'status-pill-working' : 'status-pill-ready'}`}>
                {hasUnsavedChanges ? copy.dirtyLabel : copy.cleanLabel}
              </span>
              {diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? (
                <span className="status-pill status-pill-error">Errors</span>
              ) : null}
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">{projectDetail.summary.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              {projectDetail.summary.description ?? pluginDefinition?.pluginKind ?? projectDetail.summary.pluginKind}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
              <span className="dock-chip">{projectDetail.summary.pluginKind}</span>
              {projectDetail.summary.author ? <span className="dock-chip">{projectDetail.summary.author}</span> : null}
              {projectDetail.summary.version ? <span className="dock-chip">{projectDetail.summary.version}</span> : null}
              {manifestUniqueId ? <span className="dock-chip">{manifestUniqueId}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="control-button" disabled={!canPersist} onClick={onSaveProject}>
              {copy.saveProject}
            </button>
            <button type="button" className="control-button control-button-primary" disabled={!canPersist} onClick={onExportProject}>
              {copy.exportProject}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label={copy.patchesCountLabel} value={contentSummary.changeCount} tone="accent" />
          <StatCard label={copy.includesLabel} value={contentSummary.includeCount} />
          <StatCard label={copy.dynamicTokensLabel} value={contentSummary.dynamicTokenCount} />
          <StatCard label={copy.configKeysLabel} value={contentSummary.configKeys.length} />
          <StatCard label={copy.formatLabel} value={contentSummary.format ?? copy.unknownLabel} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Mods workspace sections">
            <TabButton active={view === 'overview'} label="Overview" onClick={() => setView('overview')} />
            <TabButton active={view === 'patches'} label="Patch Flow" onClick={() => setView('patches')} />
            <TabButton active={view === 'json'} label={copy.rawJsonTitle} onClick={() => setView('json')} />
            <TabButton active={view === 'diagnostics'} label="Diagnostics" onClick={() => setView('diagnostics')} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{statusMessage || 'Review structure, patch flow, and raw sources in one workspace.'}</p>
        </div>
      </section>

      {view === 'overview' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="space-y-4">
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                <FolderTree className="h-4 w-4" />
                Project Metadata
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="panel-section-title">{copy.manifestName}</span>
                  <input className="control-input" value={manifestName} onChange={(event) => onManifestFieldChange('Name', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="panel-section-title">{copy.manifestAuthor}</span>
                  <input className="control-input" value={manifestAuthor} onChange={(event) => onManifestFieldChange('Author', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="panel-section-title">{copy.manifestVersion}</span>
                  <input className="control-input" value={manifestVersion} onChange={(event) => onManifestFieldChange('Version', event.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="panel-section-title">{copy.manifestUniqueId}</span>
                  <input className="control-input" value={manifestUniqueId} onChange={(event) => onManifestFieldChange('UniqueID', event.target.value)} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="panel-section-title">{copy.manifestDescription}</span>
                  <textarea
                    className="control-input min-h-28 resize-y"
                    value={manifestDescription}
                    onChange={(event) => onManifestFieldChange('Description', event.target.value)}
                  />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="panel-section-title">{copy.manifestContentPackFor}</span>
                  <input
                    className="control-input"
                    value={typeof contentPackFor.UniqueID === 'string' ? contentPackFor.UniqueID : ''}
                    onChange={(event) => onManifestFieldChange('ContentPackFor', event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                <GitBranchPlus className="h-4 w-4" />
                Patch Lane
              </div>
              <div className="mt-4 space-y-3">
                {contentSummary.patches.length ? (
                  contentSummary.patches.slice(0, 5).map((patch) => (
                    <PatchListItem
                      key={patch.id}
                      patch={patch}
                      active={patch.id === selectedPatchSummary?.id}
                      onClick={() => {
                        onSelectPatch(patch.id)
                        setView('patches')
                      }}
                    />
                  ))
                ) : (
                  <div className="panel-empty-state">{copy.noPatchesLabel}</div>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                {diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                Workspace Health
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  <p><span className="font-semibold text-[var(--text-primary)]">{copy.sourcePath}:</span> {projectDetail.summary.absolutePath}</p>
                  <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.manifestPathLabel}:</span> {projectDetail.summary.manifestPath}</p>
                  <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.contentPathLabel}:</span> {projectDetail.summary.contentPath ?? copy.unknownLabel}</p>
                  {lastSaveResult ? (
                    <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.outputPath}:</span> {lastSaveResult.targetPath}</p>
                  ) : null}
                </div>
                <DiagnosticList diagnostics={diagnostics} emptyLabel={copy.noDiagnosticsLabel} />
              </div>
            </section>

            <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                <Sparkles className="h-4 w-4" />
                Structure Snapshot
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Config Keys</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {contentSummary.configKeys.length ? contentSummary.configKeys.map((key) => <span key={key} className="dock-chip">{key}</span>) : <span className="text-sm text-[var(--text-secondary)]">No config keys.</span>}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Plugin Scope</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="dock-chip">{pluginDefinition?.pluginKind ?? projectDetail.summary.pluginKind}</span>
                    <span className="dock-chip">{pluginDefinition?.capabilities.length ?? 0} capabilities</span>
                    <span className="dock-chip">{pluginDefinition?.futureScopes.length ?? 0} future scopes</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {view === 'patches' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(320px,0.68fr)_minmax(0,1.32fr)]">
          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Patch Catalog</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Filter the change list, then drill into one patch without jumping between separate side panels.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="control-button" onClick={onAddPatch}>{copy.addPatch}</button>
                <button type="button" className="control-button" disabled={!selectedPatchId} onClick={onRemoveSelectedPatch}>{copy.removePatch}</button>
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                className="control-input pl-9"
                value={patchQuery}
                onChange={(event) => setPatchQuery(event.target.value)}
                placeholder="Filter patches by action, target, file, or When key"
                aria-label="Filter patches"
                spellCheck={false}
              />
            </div>

            <div className="mt-4 space-y-3">
              {filteredPatches.length ? (
                filteredPatches.map((patch) => (
                  <PatchListItem
                    key={patch.id}
                    patch={patch}
                    active={patch.id === selectedPatchSummary?.id}
                    onClick={() => onSelectPatch(patch.id)}
                  />
                ))
              ) : (
                <div className="panel-empty-state">No patches match the current filter.</div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            {selectedPatchSummary && selectedPatch && selectedPatchVisible ? (
              <>
                <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Selected Patch</p>
                      <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{logName || selectedPatchSummary.logName || copy.noPatch}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedPatchPreview?.detail}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getActionToneClass(action || selectedPatchSummary.action)}`}>
                      {action || selectedPatchSummary.action}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="panel-section-title">{copy.patchLogName}</span>
                      <input className="control-input" value={logName} onChange={(event) => onPatchFieldChange('LogName', event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="panel-section-title">{copy.patchAction}</span>
                      <input className="control-input" value={action} onChange={(event) => onPatchFieldChange('Action', event.target.value)} />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="panel-section-title">{copy.patchTarget}</span>
                      <input className="control-input" value={target} onChange={(event) => onPatchFieldChange('Target', event.target.value)} />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="panel-section-title">{copy.patchFromFile}</span>
                      <input className="control-input" value={fromFile} onChange={(event) => onPatchFieldChange('FromFile', event.target.value)} />
                    </label>
                    <label className="grid gap-2 md:col-span-2">
                      <span className="panel-section-title">{copy.patchWhenLabel}</span>
                      <textarea
                        className="control-input min-h-40 resize-y font-mono text-xs"
                        value={whenText}
                        onChange={(event) => onPatchWhenChange(event.target.value)}
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  {patchWhenError ? <p className="mt-3 text-sm text-[var(--danger)]">{patchWhenError}</p> : null}
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <PreviewImageCard
                    title="Original Asset"
                    subtitle="Resolved from the base game target selected by this patch."
                    preview={selectedSourcePreview}
                  />
                  <PreviewImageCard
                    title="Patched Result"
                    subtitle="Resolved from the mod file referenced by the patch."
                    preview={selectedResultPreview}
                  />
                </section>

                <section className="grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                  <div className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      <Boxes className="h-4 w-4" />
                      Patch Context
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="panel-list-card px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.patchTarget}</p>
                        <p className="mt-2 break-all text-sm text-[var(--text-primary)]">{selectedPatchSummary.target || copy.noTargetLabel}</p>
                      </div>
                      <div className="panel-list-card px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.whenLabel}</p>
                        <p className="mt-2 text-sm text-[var(--text-primary)]">
                          {selectedPatchSummary.whenKeys.length ? selectedPatchSummary.whenKeys.join(', ') : copy.alwaysLabel}
                        </p>
                      </div>
                      <div className="panel-list-card px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Entries</p>
                        <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedPatchEntries.length}</p>
                      </div>
                      {selectedPatchTargets.length ? (
                        <div className="panel-list-card px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Affected Targets</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedPatchTargets.map((item) => (
                              <span key={item} className="dock-chip">{item}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectedPatchSummary.updateKeys.length ? (
                        <div className="panel-list-card px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Update Triggers</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedPatchSummary.updateKeys.map((item) => (
                              <span key={item} className="dock-chip">{item}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      <FileJson2 className="h-4 w-4" />
                      Raw Patch JSON
                    </div>
                    <pre className="mt-4 overflow-auto whitespace-pre-wrap break-words rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
                      {JSON.stringify(selectedPatch, null, 2)}
                    </pre>
                  </div>
                </section>
              </>
            ) : (
              <div className="panel-empty-state min-h-[24rem] rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)]">
                {filteredPatches.length ? 'Select a visible patch to continue editing.' : 'No patches match the current filter.'}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {view === 'json' ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              <FileJson2 className="h-4 w-4" />
              manifest.json
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{manifestEditor.error ?? copy.rawJsonSubtitle}</p>
            <textarea
              className="control-input mt-4 min-h-[34rem] resize-y font-mono text-xs"
              value={manifestEditor.text}
              onChange={(event) => onManifestTextChange(event.target.value)}
              aria-label="manifest.json editor"
              spellCheck={false}
            />
          </section>

          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              <FileJson2 className="h-4 w-4" />
              content.json
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{contentEditor.error ?? copy.rawJsonSubtitle}</p>
            <textarea
              className="control-input mt-4 min-h-[34rem] resize-y font-mono text-xs"
              value={contentEditor.text}
              onChange={(event) => onContentTextChange(event.target.value)}
              aria-label="content.json editor"
              spellCheck={false}
            />
          </section>
        </section>
      ) : null}

      {view === 'diagnostics' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              {diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              Diagnostics
            </div>
            <div className="mt-4 rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <p><span className="font-semibold text-[var(--text-primary)]">{copy.sourcePath}:</span> {projectDetail.summary.absolutePath}</p>
              <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.manifestPathLabel}:</span> {projectDetail.summary.manifestPath}</p>
              <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.contentPathLabel}:</span> {projectDetail.summary.contentPath ?? copy.unknownLabel}</p>
              {lastSaveResult ? (
                <p className="mt-2"><span className="font-semibold text-[var(--text-primary)]">{copy.outputPath}:</span> {lastSaveResult.targetPath}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              <Sparkles className="h-4 w-4" />
              Validation Feed
            </div>
            <div className="mt-4">
              <DiagnosticList diagnostics={diagnostics} emptyLabel={copy.noDiagnosticsLabel} />
            </div>
          </section>
        </section>
      ) : null}
    </div>
  )
}
