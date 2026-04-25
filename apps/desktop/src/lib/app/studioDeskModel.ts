import type { GeneratedProjectDraftSummary } from '../desktop'
import type { WorkspaceId } from '../plugins/workspaceRegistry'
import type { DraftPatch, GeneratedProjectDraft } from './useGeneratedProject'

export type StudioDeskInspirationStatus = 'modified' | 'synced'
export type StudioDeskInspirationKind = 'event' | 'map' | 'asset' | 'project'

export type StudioDeskInspiration = {
  patchId: string
  kind: StudioDeskInspirationKind
  title: string
  target: string
  action: DraftPatch['action']
  updatedAt: number | null
  status: StudioDeskInspirationStatus
  workspaceId: WorkspaceId
}

export type StudioDeskWorkspaceEntrypoint = {
  kind: 'independent-workspace'
  workspaceId: WorkspaceId
  patchCount: number
}

export type StudioDeskWorldBibleEntry = {
  key: string
  value: string
}

export type StudioDeskWorldBible = {
  configSchema: StudioDeskWorldBibleEntry[]
  tokens: StudioDeskWorldBibleEntry[]
  customLocations: StudioDeskWorldBibleEntry[]
  conflictCount: number
}

export type StudioDeskModel = {
  projectName: string
  projectDescription: string
  projectUniqueId: string
  hasActiveDraft: boolean
  draftSummaries: GeneratedProjectDraftSummary[]
  recentInspirations: StudioDeskInspiration[]
  workspaceEntrypoints: StudioDeskWorkspaceEntrypoint[]
  stats: {
    eventCount: number
    mapCount: number
    festivalCount: number
    conflictCount: number
  }
  worldBible: StudioDeskWorldBible
  exportSummary: {
    lastExportedAt: number | null
    fileList: string[]
  }
}

type BuildStudioDeskModelInput = {
  activeDraft: GeneratedProjectDraft | null
  drafts: GeneratedProjectDraftSummary[]
  patchCountByWorkspace: Partial<Record<WorkspaceId, number>>
  dirtyPatchIds: Set<string>
  isDirty: boolean
}

const workspaceOrder: WorkspaceId[] = ['events', 'map', 'characters', 'buildings', 'items', 'mods']

function getPatchKind(patch: DraftPatch): StudioDeskInspirationKind {
  if (patch.workspace === 'events') return 'event'
  if (patch.workspace === 'map') return 'map'
  if (patch.workspace === 'characters' || patch.workspace === 'buildings' || patch.workspace === 'items') return 'asset'
  return 'project'
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

function getPatchTitle(patch: DraftPatch): string {
  return patch.logName.trim() || patch.target.trim() || patch.action
}

function countFestivalSignals(activeDraft: GeneratedProjectDraft | null): number {
  if (!activeDraft) return 0
  const values = [
    ...activeDraft.patches.flatMap((patch) => [patch.logName, patch.target]),
    ...activeDraft.customLocations.map((location) => location.name),
  ]
  return values.filter((value) => /festival|节日|祭/i.test(value)).length
}

function buildExportFileList(activeDraft: GeneratedProjectDraft | null): string[] {
  if (!activeDraft) return []
  const workspaceFiles = new Set<string>()
  for (const patch of activeDraft.patches) {
    workspaceFiles.add(`changes/${patch.workspace}.json`)
  }

  return [
    'manifest.json',
    'content.json',
    ...Array.from(workspaceFiles).sort(),
    ...(activeDraft.configSchema.length > 0 ? ['config.json'] : []),
    ...activeDraft.virtualAssets.map((asset) => asset.relativePath).sort(),
  ]
}

export function buildStudioDeskModel(input: BuildStudioDeskModelInput): StudioDeskModel {
  const activeDraft = input.activeDraft
  const patches = activeDraft?.patches ?? []
  const conflictCount = patches.filter((patch) => patch.enabled === false).length
  const activeSummary = input.drafts.find((summary) => summary.draftStorageKey === activeDraft?.draftStorageKey)

  return {
    projectName: activeDraft?.projectMetadata.projectName ?? '',
    projectDescription: activeDraft?.projectMetadata.projectDescription ?? '',
    projectUniqueId: activeDraft?.projectMetadata.projectUniqueId ?? '',
    hasActiveDraft: Boolean(activeDraft),
    draftSummaries: input.drafts,
    recentInspirations: patches
      .slice()
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .slice(0, 12)
      .map((patch) => ({
        patchId: patch.id,
        kind: getPatchKind(patch),
        title: getPatchTitle(patch),
        target: patch.target,
        action: patch.action,
        updatedAt: patch.updatedAt ?? null,
        status: input.dirtyPatchIds.has(patch.id) ? 'modified' : 'synced',
        workspaceId: patch.workspace,
      })),
    workspaceEntrypoints: workspaceOrder.map((workspaceId) => ({
      kind: 'independent-workspace',
      workspaceId,
      patchCount: input.patchCountByWorkspace[workspaceId] ?? 0,
    })),
    stats: {
      eventCount: input.patchCountByWorkspace.events ?? 0,
      mapCount: input.patchCountByWorkspace.map ?? 0,
      festivalCount: countFestivalSignals(activeDraft),
      conflictCount,
    },
    worldBible: {
      configSchema: (activeDraft?.configSchema ?? []).map((entry) => ({
        key: entry.key,
        value: stringifyValue(entry.defaultValue),
      })),
      tokens: (activeDraft?.dynamicTokens ?? []).map((token) => ({
        key: token.name,
        value: `{{${token.name}}}`,
      })),
      customLocations: (activeDraft?.customLocations ?? []).map((location) => ({
        key: location.name,
        value: location.fromMapFile ?? '',
      })),
      conflictCount,
    },
    exportSummary: {
      lastExportedAt: activeSummary?.lastExportedAt ?? null,
      fileList: buildExportFileList(activeDraft),
    },
  }
}
