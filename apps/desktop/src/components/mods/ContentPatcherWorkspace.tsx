import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderTree, GitBranchPlus, Sparkles } from 'lucide-react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeProps,
  type OnConnect,
} from '@xyflow/react'
import type { ModProjectDetail, ModProjectDiagnostic, SaveModProjectResult } from '../../lib/desktop'
import {
  buildContentPatcherCanvas,
  collectContentPatcherAssets,
  collectContentPatcherTargets,
  getContentPatcherConditionPresets,
  getPatchPreviewJson,
  validateContentPatcherConnection,
} from '../../lib/plugins/contentPatcher'
import type {
  ContentPatcherCanvasNode,
  ContentPatcherCanvasNodeKind,
  ContentPatcherSimulationContext,
} from '../../lib/plugins/contentPatcher'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'
import type { WorkspacePluginDefinition } from '../../lib/plugins/types'
import { ModDiagnosticsPanel } from './ModDiagnosticsPanel'
import { PatchInspectorPanel } from './PatchInspectorPanel'

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

type CanvasNodeData = ContentPatcherCanvasNode['data'] & {
  kind: ContentPatcherCanvasNodeKind
}

type FlowNode = Node<CanvasNodeData>
type FlowEdge = Edge<{ patchId?: string; edgeType?: 'logic' | 'file' | 'data' }>

type DropPayload = {
  kind: 'asset' | 'target' | 'condition'
  value: string
}

type PatchUpdate =
  | { type: 'field'; patchId: string; field: 'FromFile' | 'Target'; value: string }
  | { type: 'when'; patchId: string; value: string }

const edgeTone: Record<'logic' | 'file' | 'data', string> = {
  logic: 'var(--cp-logic)',
  file: 'var(--cp-file)',
  data: 'var(--cp-data)',
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseDropPayload(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return null
  }
  const raw = dataTransfer.getData('application/x-modforge-node')
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as DropPayload
    if (!parsed || typeof parsed.value !== 'string') {
      return null
    }
    if (parsed.kind !== 'asset' && parsed.kind !== 'target' && parsed.kind !== 'condition') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function resolveWhenValue(key: string, simulation: ContentPatcherSimulationContext) {
  if (key === 'Season') {
    return simulation.season || 'spring'
  }
  if (key === 'Weather') {
    return simulation.weather || 'sunny'
  }
  if (key === 'Relationship') {
    if (simulation.relationship !== undefined && simulation.relationship !== null && simulation.relationship !== '') {
      const numeric = Number(simulation.relationship)
      return Number.isNaN(numeric) ? simulation.relationship : numeric
    }
    return 0
  }
  if (key === 'Config') {
    if (simulation.config && Object.keys(simulation.config).length) {
      return simulation.config
    }
    return { Enabled: true }
  }
  if (simulation.config && key in simulation.config) {
    return simulation.config[key]
  }
  return true
}

function buildWhenPayload(existingWhen: unknown, key: string, value: unknown) {
  const base = isJsonObject(existingWhen) ? { ...existingWhen } : {}
  if (key === 'Config' && isJsonObject(value)) {
    base.Config = value
  } else {
    base[key] = value
  }
  return JSON.stringify(base, null, 2)
}

function removeWhenKey(existingWhen: unknown, key: string) {
  if (!isJsonObject(existingWhen)) {
    return ''
  }
  const base = { ...existingWhen }
  delete base[key]
  if (!Object.keys(base).length) {
    return ''
  }
  return JSON.stringify(base, null, 2)
}

function CanvasNode({ data }: NodeProps<FlowNode>) {
  const isInactive = data.simulation?.isActive === false
  const hasUnknown = data.simulation?.hasUnknownConditions
  const status = isInactive ? 'Disabled' : hasUnknown ? 'Unknown' : 'Active'

  return (
    <div className={`cp-node cp-node-${data.kind}${isInactive ? ' cp-node-disabled' : ''}`}>
      {data.kind === 'action' ? (
        <>
          <Handle type="target" position={Position.Left} id="logic" className="cp-handle cp-handle-logic" />
          <Handle type="target" position={Position.Left} id="file" className="cp-handle cp-handle-file cp-handle-offset" />
          <Handle type="source" position={Position.Right} id="data" className="cp-handle cp-handle-data" />
        </>
      ) : null}
      {data.kind === 'condition' ? (
        <Handle type="source" position={Position.Right} id="logic" className="cp-handle cp-handle-logic" />
      ) : null}
      {data.kind === 'asset' ? (
        <Handle type="source" position={Position.Right} id="file" className="cp-handle cp-handle-file" />
      ) : null}
      {data.kind === 'target' ? (
        <Handle type="target" position={Position.Left} id="data" className="cp-handle cp-handle-data" />
      ) : null}
      <div className="cp-node-header">
        <span className="cp-node-kind">{data.kind}</span>
        <span className={`cp-node-status${isInactive ? ' cp-node-status-off' : ''}`}>{status}</span>
      </div>
      <div className="cp-node-title">{data.label}</div>
      {data.action ? <div className="cp-node-meta">Action: {data.action}</div> : null}
      {data.target ? <div className="cp-node-meta">Target: {data.target}</div> : null}
      {data.assetPath ? <div className="cp-node-meta">Asset: {data.assetPath}</div> : null}
      {data.whenKey ? <div className="cp-node-meta">When: {data.whenKey}</div> : null}
    </div>
  )
}

export function ContentPatcherWorkspace({
  copy,
  pluginDefinition,
  projectDetail,
  diagnostics,
  statusMessage,
  lastSaveResult,
  manifestEditor: _manifestEditor,
  contentEditor,
  contentSummary,
  selectedPatchId,
  selectedPatch,
  patchWhenError,
  hasUnsavedChanges,
  canPersist,
  onSelectPatch,
  onPatchFieldChange,
  onPatchWhenChange,
  onAddPatch,
  onSaveProject,
  onExportProject,
}: ContentPatcherWorkspaceProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<DropPayload | null>(null)
  const [pendingPatchUpdate, setPendingPatchUpdate] = useState<PatchUpdate | null>(null)
  const [simulation, setSimulation] = useState<ContentPatcherSimulationContext>({
    season: '',
    weather: '',
    relationship: '',
  })

  const simulationContext = useMemo(
    () => ({
      season: simulation.season || undefined,
      weather: simulation.weather || undefined,
      relationship: simulation.relationship || undefined,
      config: simulation.config,
    }),
    [simulation.config, simulation.relationship, simulation.season, simulation.weather],
  )

  const assets = useMemo(() => collectContentPatcherAssets(contentEditor.value), [contentEditor.value])
  const targets = useMemo(() => collectContentPatcherTargets(contentEditor.value), [contentEditor.value])
  const presets = useMemo(() => getContentPatcherConditionPresets(), [])

  const canvas = useMemo(() => buildContentPatcherCanvas(contentEditor.value, { simulation: simulationContext }), [contentEditor.value, simulationContext])
  const nodeMap = useMemo(() => new Map(canvas.nodes.map((node) => [node.id, node])), [canvas.nodes])
  const patchActivity = useMemo(() => {
    const map = new Map<string, boolean>()
    canvas.nodes.forEach((node) => {
      if (node.kind === 'action' && node.data.patchId && node.data.simulation) {
        map.set(node.data.patchId, node.data.simulation.isActive)
      }
    })
    return map
  }, [canvas.nodes])

  const flowNodes = useMemo<FlowNode[]>(
    () =>
      canvas.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        type: 'canvasNode',
        data: {
          ...node.data,
          kind: node.kind,
        } satisfies CanvasNodeData,
        className: `cp-node-shell cp-node-shell-${node.kind}${node.data.simulation?.isActive === false ? ' cp-node-shell-disabled' : ''}`,
      })),
    [canvas.nodes],
  )

  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      canvas.edges.map((edge) => {
        const tone = edgeTone[edge.type]
        const isActive = edge.patchId ? patchActivity.get(edge.patchId) !== false : true
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.type,
          targetHandle: edge.type,
          className: `cp-edge cp-edge-${edge.type}${!isActive ? ' cp-edge-disabled' : ''}`,
          data: {
            patchId: edge.patchId,
            edgeType: edge.type,
          },
          style: {
            stroke: tone,
            strokeWidth: 2.2,
            opacity: isActive ? 0.9 : 0.35,
          },
        }
      }),
    [canvas.edges, patchActivity],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(flowNodes)
  const [edges, setEdges] = useEdgesState<FlowEdge>(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  useEffect(() => {
    if (!selectedPatchId) {
      setSelectedNodeId(null)
      return
    }
    const actionNode = canvas.nodes.find((node) => node.kind === 'action' && node.data.patchId === selectedPatchId)
    if (actionNode) {
      setSelectedNodeId(actionNode.id)
    }
  }, [canvas.nodes, selectedPatchId])

  useEffect(() => {
    if (!pendingDrop || !selectedPatchId) {
      return
    }
    applyDropToPatch(pendingDrop, selectedPatchId)
    setPendingDrop(null)
  }, [pendingDrop, selectedPatchId])

  useEffect(() => {
    if (!pendingPatchUpdate) {
      return
    }
    if (pendingPatchUpdate.patchId !== selectedPatchId) {
      return
    }
    applyPatchUpdate(pendingPatchUpdate)
    setPendingPatchUpdate(null)
  }, [pendingPatchUpdate, selectedPatchId])

  if (!projectDetail?.contentPatcher) {
    return <div className="panel-empty-state h-full">{copy.noProject}</div>
  }

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null
  const activePatchId = selectedNode?.data.patchId ?? selectedPatchId
  const patchPreview = activePatchId ? getPatchPreviewJson(contentEditor.value, activePatchId) : ''

  function applyPatchUpdate(update: PatchUpdate) {
    if (update.type === 'field') {
      onPatchFieldChange(update.field, update.value)
      return
    }
    onPatchWhenChange(update.value)
  }

  function queuePatchUpdate(update: PatchUpdate) {
    if (update.patchId !== selectedPatchId) {
      setPendingPatchUpdate(update)
      onSelectPatch(update.patchId)
      return
    }
    applyPatchUpdate(update)
  }

  function getExistingWhen(patchId: string) {
    if (selectedPatchId === patchId && selectedPatch && isJsonObject(selectedPatch.When)) {
      return selectedPatch.When
    }
    const actionNode = canvas.nodes.find((node) => node.kind === 'action' && node.data.patchId === patchId)
    return actionNode?.data.details?.when ?? null
  }

  function applyDropToPatch(payload: DropPayload, patchId: string) {
    if (payload.kind === 'asset') {
      queuePatchUpdate({ type: 'field', patchId, field: 'FromFile', value: payload.value })
      return
    }
    if (payload.kind === 'target') {
      queuePatchUpdate({ type: 'field', patchId, field: 'Target', value: payload.value })
      return
    }
    const existingWhen = getExistingWhen(patchId)
    const nextValue = resolveWhenValue(payload.value, simulationContext)
    const nextWhen = buildWhenPayload(existingWhen, payload.value, nextValue)
    queuePatchUpdate({ type: 'when', patchId, value: nextWhen })
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const payload = parseDropPayload(event.dataTransfer)
    if (!payload) {
      return
    }
    if (!selectedPatchId) {
      setPendingDrop(payload)
      onAddPatch()
      return
    }
    applyDropToPatch(payload, selectedPatchId)
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) {
      return
    }
    const sourceNode = nodeMap.get(connection.source)
    const targetNode = nodeMap.get(connection.target)
    if (!sourceNode || !targetNode) {
      return
    }
    const result = validateContentPatcherConnection({
      sourceKind: sourceNode.kind,
      targetKind: targetNode.kind,
      action: sourceNode.data.action,
      targetPath: targetNode.data.target,
    })
    if (!result.ok) {
      setConnectionError(result.detail ?? result.reason)
      return
    }

    setConnectionError(null)
    const tone = edgeTone[result.edgeType]
    const patchId =
      result.edgeType === 'data'
        ? sourceNode.data.patchId
        : result.edgeType === 'logic'
          ? targetNode.data.patchId
          : targetNode.data.patchId

    if (patchId) {
      if (result.edgeType === 'file' && sourceNode.data.assetPath) {
        queuePatchUpdate({ type: 'field', patchId, field: 'FromFile', value: sourceNode.data.assetPath })
      }
      if (result.edgeType === 'data' && targetNode.data.target) {
        queuePatchUpdate({ type: 'field', patchId, field: 'Target', value: targetNode.data.target })
      }
      if (result.edgeType === 'logic' && sourceNode.data.whenKey) {
        const existingWhen = getExistingWhen(patchId)
        const nextValue = resolveWhenValue(sourceNode.data.whenKey, simulationContext)
        const nextWhen = buildWhenPayload(existingWhen, sourceNode.data.whenKey, nextValue)
        queuePatchUpdate({ type: 'when', patchId, value: nextWhen })
      }
    }

    setEdges((current) =>
      addEdge(
        {
          ...connection,
          className: `cp-edge cp-edge-${result.edgeType}`,
          style: { stroke: tone, strokeWidth: 2.2, opacity: 0.9 },
          sourceHandle: result.edgeType,
          targetHandle: result.edgeType,
          data: { patchId, edgeType: result.edgeType },
        },
        current,
      ) as FlowEdge[],
    )
  }

  function handleEdgesChange(changes: EdgeChange[]) {
    changes.forEach((change) => {
      if (change.type !== 'remove') {
        return
      }
      const edge = edges.find((entry) => entry.id === change.id)
      if (!edge) {
        return
      }
      const patchId = edge.data?.patchId as string | undefined
      const edgeType = edge.data?.edgeType as 'logic' | 'file' | 'data' | undefined
      if (!patchId || !edgeType) {
        return
      }
      if (edgeType === 'file') {
        queuePatchUpdate({ type: 'field', patchId, field: 'FromFile', value: '' })
        return
      }
      if (edgeType === 'data') {
        queuePatchUpdate({ type: 'field', patchId, field: 'Target', value: '' })
        return
      }
      if (edgeType === 'logic') {
        const sourceNode = nodeMap.get(edge.source)
        if (!sourceNode?.data.whenKey) {
          return
        }
        const existingWhen = getExistingWhen(patchId)
        const nextWhen = removeWhenKey(existingWhen, sourceNode.data.whenKey)
        queuePatchUpdate({ type: 'when', patchId, value: nextWhen })
      }
    })
    setEdges((current) => applyEdgeChanges(changes, current) as FlowEdge[])
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-[var(--bg-panel)] p-4">
      <header className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="dock-chip">Mods Workspace</span>
              <span className={`status-pill ${hasUnsavedChanges ? 'status-pill-working' : 'status-pill-ready'}`}>
                {hasUnsavedChanges ? copy.dirtyLabel : copy.cleanLabel}
              </span>
              {diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? (
                <span className="status-pill status-pill-error">Errors</span>
              ) : (
                <span className="status-pill status-pill-ready">Healthy</span>
              )}
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">{projectDetail.summary.name}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Shape your patch logic on the canvas, then verify output in real time before exporting.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="dock-chip">{projectDetail.summary.pluginKind}</span>
              {projectDetail.summary.author ? <span className="dock-chip">{projectDetail.summary.author}</span> : null}
              {projectDetail.summary.version ? <span className="dock-chip">{projectDetail.summary.version}</span> : null}
              {projectDetail.summary.uniqueId ? <span className="dock-chip">{projectDetail.summary.uniqueId}</span> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Simulation</p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <label className="grid gap-1 text-[11px] text-[var(--text-tertiary)]">
                  Season
                  <select
                    className="control-input h-9"
                    aria-label="Simulation Season"
                    value={simulation.season ?? ''}
                    onChange={(event) => setSimulation((current) => ({ ...current, season: event.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="spring">Spring</option>
                    <option value="summer">Summer</option>
                    <option value="fall">Fall</option>
                    <option value="winter">Winter</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] text-[var(--text-tertiary)]">
                  Weather
                  <select
                    className="control-input h-9"
                    aria-label="Simulation Weather"
                    value={simulation.weather ?? ''}
                    onChange={(event) => setSimulation((current) => ({ ...current, weather: event.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="sunny">Sunny</option>
                    <option value="rain">Rain</option>
                    <option value="storm">Storm</option>
                    <option value="snow">Snow</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] text-[var(--text-tertiary)]">
                  Relationship
                  <select
                    className="control-input h-9"
                    aria-label="Simulation Relationship"
                    value={simulation.relationship ?? ''}
                    onChange={(event) => setSimulation((current) => ({ ...current, relationship: event.target.value }))}
                  >
                    <option value="">Any</option>
                    <option value="0">0</option>
                    <option value="4">4+</option>
                    <option value="8">8+</option>
                    <option value="10">10+</option>
                    <option value="12">12+</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="control-button" onClick={() => setShowDiagnostics((current) => !current)}>
                {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
              </button>
              <button type="button" className="control-button" disabled={!canPersist} onClick={onSaveProject}>
                {copy.saveProject}
              </button>
              <button type="button" className="control-button control-button-primary" disabled={!canPersist} onClick={onExportProject}>
                {copy.exportProject}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.patchesCountLabel}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{contentSummary.changeCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.includesLabel}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{contentSummary.includeCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.dynamicTokensLabel}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{contentSummary.dynamicTokenCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.configKeysLabel}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{contentSummary.configKeys.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.formatLabel}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{contentSummary.format ?? copy.unknownLabel}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          {statusMessage || 'Simulation highlights which patches are active for the selected season, weather, and relationship.'}
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)_minmax(300px,0.9fr)]">
        <aside className="flex flex-col gap-4">
          <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              <FolderTree className="h-4 w-4" />
              Asset Library
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Drag assets or presets into the canvas to spawn nodes.
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Assets</p>
                <div className="mt-2 grid gap-2">
                  {assets.length ? assets.map((asset) => (
                    <div
                      key={asset.path}
                      className="asset-row"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-modforge-node', JSON.stringify({ kind: 'asset', value: asset.path }))
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-primary)]">
                        <span className="truncate">{asset.path}</span>
                        <span className="dock-chip">{asset.kind}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="panel-empty-state text-xs">No local assets detected.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Presets</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <span
                      key={preset.key}
                      className="dock-chip"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-modforge-node', JSON.stringify({ kind: 'condition', value: preset.key }))
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                    >
                      {preset.key}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Game Targets</p>
                <div className="mt-2 grid gap-2">
                  {targets.length ? targets.map((target) => (
                    <div
                      key={target}
                      className="asset-row"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-modforge-node', JSON.stringify({ kind: 'target', value: target }))
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-primary)]">
                        <span className="truncate">{target}</span>
                        <span className="dock-chip">Target</span>
                      </div>
                    </div>
                  )) : (
                    <div className="panel-empty-state text-xs">No targets detected.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </aside>

        <section className="flex min-h-[520px] flex-col gap-3 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                <GitBranchPlus className="h-4 w-4" />
                Node Canvas
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Connect conditions, assets, and targets. Types are color-coded for quick scanning.
              </p>
            </div>
            {connectionError ? (
              <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-[var(--text-primary)]">
                <strong className="mr-1 text-orange-600">Type mismatch:</strong>
                {connectionError}
              </div>
            ) : (
              <span className="dock-chip">Logic • File • Data</span>
            )}
          </div>

          <div className="cp-canvas panel-canvas flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={{ canvasNode: CanvasNode }}
              onNodesChange={onNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id)
                const nodeData = node.data as CanvasNodeData
                if (nodeData.patchId && nodeData.patchId !== selectedPatchId) {
                  onSelectPatch(nodeData.patchId)
                }
              }}
              fitView
              minZoom={0.4}
              maxZoom={1.8}
              className="cp-reactflow"
              data-testid="reactflow"
            >
              <Background gap={20} size={1} />
              <MiniMap zoomable pannable className="cp-minimap" />
              <Controls showInteractive={false} className="cp-controls" />
            </ReactFlow>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              <Sparkles className="h-4 w-4" />
              Node Inspector
            </div>
          </section>
          <PatchInspectorPanel
            copy={copy}
            selectedPatch={selectedPatch}
            patchWhenError={patchWhenError}
            onPatchFieldChange={onPatchFieldChange}
            onPatchWhenChange={onPatchWhenChange}
            selectedNode={selectedNode}
            patchPreview={patchPreview}
          />
          {showDiagnostics ? (
            <ModDiagnosticsPanel
              copy={copy}
              pluginDefinition={pluginDefinition}
              activeProject={projectDetail}
              diagnostics={diagnostics}
              hasUnsavedChanges={hasUnsavedChanges}
              lastSaveResult={lastSaveResult}
              statusMessage={statusMessage}
              contentSummary={contentSummary}
            />
          ) : (
            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    {diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    Diagnostics
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Keep this collapsed until you need validation details, save output, or project paths.
                  </p>
                </div>
                <button type="button" className="control-button" onClick={() => setShowDiagnostics(true)}>
                  Open Diagnostics
                </button>
              </div>
            </section>
          )}
        </aside>
      </section>

      <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
          <FolderTree className="h-4 w-4" />
          content.json Preview
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          This preview updates as you adjust nodes and connections.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-3 text-xs text-[var(--text-secondary)]" aria-label="content.json preview" aria-live="polite">
          {patchPreview || contentEditor.text}
        </pre>
      </section>
    </div>
  )
}
