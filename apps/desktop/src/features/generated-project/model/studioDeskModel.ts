import type { GeneratedProjectDraftSummary } from '@platform/desktop'
import type { DraftPatch, GeneratedProjectDraft, WorkspaceId } from '@shared/contracts'

export type StudioDeskInspirationStatus = 'modified' | 'synced'
export type StudioDeskInspirationKind = 'event' | 'map' | 'asset' | 'project'
export type StudioDeskProjectFilter = 'all' | 'active' | 'export' | 'conflict' | 'archive'
export type StudioDeskProjectStatus = Exclude<StudioDeskProjectFilter, 'all'>
export type StudioDeskProjectCoverTone = 'festival' | 'harbor' | 'market' | 'forest' | 'greenhouse' | 'archive'

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
  actors: StudioDeskWorldBibleEntry[]
  story: StudioDeskWorldBibleEntry[]
  items: StudioDeskWorldBibleEntry[]
  scenes: StudioDeskWorldBibleEntry[]
  conflictCount: number
}

export type StudioDeskGalleryProject = {
  draftStorageKey: string
  title: string
  uniqueId: string
  lastEditedAt: number | null
  lastExportedAt: number | null
  isCurrent: boolean
  statuses: StudioDeskProjectStatus[]
  searchText: string
  coverTone: StudioDeskProjectCoverTone
  conflictCount: number
}

export type StudioDeskGallery = {
  projects: StudioDeskGalleryProject[]
  counts: Record<StudioDeskProjectFilter, number>
}

export type StudioDeskModel = {
  projectName: string
  projectDescription: string
  projectUniqueId: string
  hasActiveDraft: boolean
  draftSummaries: GeneratedProjectDraftSummary[]
  gallery: StudioDeskGallery
  recentInspirations: StudioDeskInspiration[]
  workspaceEntrypoints: StudioDeskWorkspaceEntrypoint[]
  stats: {
    eventCount: number
    mapCount: number
    festivalCount: number
    assetCount: number
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
const coverTones: StudioDeskProjectCoverTone[] = ['festival', 'harbor', 'market', 'forest', 'greenhouse']

function getPatchKind(patch: DraftPatch): StudioDeskInspirationKind {
  if (patch.workspace === 'events') return 'event'
  if (patch.workspace === 'map') return 'map'
  if (isAssetWorkspace(patch.workspace)) return 'asset'
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

function isAssetWorkspace(workspace: WorkspaceId): boolean {
  return workspace === 'characters' || workspace === 'buildings' || workspace === 'items'
}

function getPatchEntry(patch: DraftPatch): StudioDeskWorldBibleEntry {
  return {
    key: getPatchTitle(patch),
    value: patch.target.trim() || patch.action,
  }
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

function isDraftWaitingForExport(summary: GeneratedProjectDraftSummary, isCurrent: boolean, isDirty: boolean): boolean {
  if (isCurrent && isDirty) return true
  const savedAt = summary.lastDraftSavedAt ?? 0
  const exportedAt = summary.lastExportedAt ?? 0
  return savedAt > 0 && savedAt > exportedAt
}

function buildGalleryProjects(input: BuildStudioDeskModelInput, conflictCount: number): StudioDeskGallery {
  const activeDraftKey = input.activeDraft?.draftStorageKey ?? null
  const summaries = input.activeDraft && !input.drafts.some((summary) => summary.draftStorageKey === input.activeDraft?.draftStorageKey)
    ? [
        {
          draftStorageKey: input.activeDraft.draftStorageKey,
          projectName: input.activeDraft.projectMetadata.projectName,
          projectUniqueId: input.activeDraft.projectMetadata.projectUniqueId,
          lastDraftSavedAt: null,
          lastExportedAt: null,
        },
        ...input.drafts,
      ]
    : input.drafts
  const projects = summaries.map((summary, index): StudioDeskGalleryProject => {
    const isCurrent = summary.draftStorageKey === activeDraftKey
    const statuses: StudioDeskProjectStatus[] = ['active']
    const projectConflictCount = isCurrent ? conflictCount : 0
    if (isDraftWaitingForExport(summary, isCurrent, input.isDirty)) {
      statuses.push('export')
    }
    if (projectConflictCount > 0) {
      statuses.push('conflict')
    }

    return {
      draftStorageKey: summary.draftStorageKey,
      title: summary.projectName.trim() || summary.draftStorageKey,
      uniqueId: summary.projectUniqueId,
      lastEditedAt: summary.lastDraftSavedAt,
      lastExportedAt: summary.lastExportedAt,
      isCurrent,
      statuses,
      searchText: [
        summary.projectName,
        summary.projectUniqueId,
        summary.draftStorageKey,
        isCurrent ? input.activeDraft?.projectMetadata.projectDescription ?? '' : '',
      ].join(' '),
      coverTone: coverTones[index % coverTones.length] ?? 'festival',
      conflictCount: projectConflictCount,
    }
  })

  const counts: Record<StudioDeskProjectFilter, number> = {
    all: projects.length,
    active: projects.filter((project) => project.statuses.includes('active')).length,
    export: projects.filter((project) => project.statuses.includes('export')).length,
    conflict: projects.filter((project) => project.statuses.includes('conflict')).length,
    archive: projects.filter((project) => project.statuses.includes('archive')).length,
  }

  return { projects, counts }
}

export function buildStudioDeskModel(input: BuildStudioDeskModelInput): StudioDeskModel {
  const activeDraft = input.activeDraft
  const patches = activeDraft?.patches ?? []
  const conflictCount = patches.filter((patch) => patch.enabled === false).length
  const activeSummary = input.drafts.find((summary) => summary.draftStorageKey === activeDraft?.draftStorageKey)
  const assetCount =
    (input.patchCountByWorkspace.characters ?? 0) +
    (input.patchCountByWorkspace.buildings ?? 0) +
    (input.patchCountByWorkspace.items ?? 0) +
    (activeDraft?.virtualAssets.length ?? 0)

  return {
    projectName: activeDraft?.projectMetadata.projectName ?? '',
    projectDescription: activeDraft?.projectMetadata.projectDescription ?? '',
    projectUniqueId: activeDraft?.projectMetadata.projectUniqueId ?? '',
    hasActiveDraft: Boolean(activeDraft),
    draftSummaries: input.drafts,
    gallery: buildGalleryProjects(input, conflictCount),
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
      assetCount,
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
      actors: patches
        .filter((patch) => patch.workspace === 'characters')
        .map(getPatchEntry),
      story: patches
        .filter((patch) => patch.workspace === 'events')
        .map(getPatchEntry),
      items: patches
        .filter((patch) => patch.workspace === 'items')
        .map(getPatchEntry),
      scenes: [
        ...(activeDraft?.customLocations ?? []).map((location) => ({
          key: location.name,
          value: location.fromMapFile ?? '',
        })),
        ...patches
          .filter((patch) => patch.workspace === 'map' || patch.workspace === 'buildings')
          .map(getPatchEntry),
      ],
      conflictCount,
    },
    exportSummary: {
      lastExportedAt: activeSummary?.lastExportedAt ?? null,
      fileList: buildExportFileList(activeDraft),
    },
  }
}
