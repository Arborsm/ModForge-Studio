import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  copyGeneratedProjectDraft,
  deleteGeneratedProjectDraft,
  exportGeneratedProjectPack,
  loadGeneratedProjectDraft,
  listGeneratedProjectDrafts,
  saveGeneratedProjectDraft,
  type GeneratedProjectDraftRecord,
  type GeneratedProjectExportResult,
  type GeneratedProjectDraftSummary,
} from '../desktop'
import type { WorkspaceId } from '../plugins/workspaceRegistry'

export interface ConfigSchemaEntry {
  key: string
  defaultValue: unknown
  allowValues?: unknown[]
  description?: string
}

export interface DraftPatch {
  id: string
  workspace: WorkspaceId
  target: string
  action: 'EditData' | 'EditImage' | 'EditMap' | 'Load'
  logName: string
  enabled: boolean
  when?: Record<string, unknown>
  fromFile?: string
  editorState: unknown
}

export interface GeneratedProjectOverlayTarget {
  uniqueId: string
  displayName: string | null
  required: boolean
  source: 'scanned-mod' | 'manual'
}

export interface GeneratedProjectDraft {
  draftStorageKey: string
  projectMetadata: {
    projectName: string
    projectDescription: string
    projectAuthor: string
    projectVersion: string
    projectUniqueId: string
    gameRootPath: string | null
    contentPackForUniqueId: string
  }
  overlayTargets: GeneratedProjectOverlayTarget[]
  configSchema: ConfigSchemaEntry[]
  patches: DraftPatch[]
  virtualAssets: VirtualPreviewAsset[]
}

export interface VirtualPreviewAsset {
  relativePath: string
  mediaType: string
  bytesBase64: string
}

// ─── Adapter: backend record ↔ frontend draft ─────────────────────────

function parseConfigSchema(configSchemaDraft: Record<string, unknown>): ConfigSchemaEntry[] {
  return Object.entries(configSchemaDraft)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, definition]) => {
      const def = typeof definition === 'object' && definition !== null && !Array.isArray(definition)
        ? definition as Record<string, unknown>
        : {}
      return {
        key,
        defaultValue: def['Default'] ?? null,
        allowValues: Array.isArray(def['AllowValues']) ? def['AllowValues'] : undefined,
        description: typeof def['Description'] === 'string' ? def['Description'] : undefined,
      }
    })
}

function serializeConfigSchema(entries: ConfigSchemaEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    const def: Record<string, unknown> = { Default: entry.defaultValue }
    if (entry.allowValues !== undefined) {
      def['AllowValues'] = entry.allowValues
    }
    if (entry.description !== undefined) {
      def['Description'] = entry.description
    }
    result[entry.key] = def
  }
  return result
}

function parseChangeRegistry(serialized: Record<string, unknown>): DraftPatch[] {
  const patches = Array.isArray(serialized['patches']) ? serialized['patches'] : []
  return patches
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p))
    .map((p) => ({
      id: String(p['id'] ?? ''),
      workspace: String(p['workspace'] ?? 'map') as WorkspaceId,
      target: String(p['target'] ?? ''),
      action: String(p['action'] ?? 'EditData') as DraftPatch['action'],
      logName: String(p['logName'] ?? ''),
      enabled: p['enabled'] !== false,
      when: typeof p['when'] === 'object' && p['when'] !== null && !Array.isArray(p['when'])
        ? p['when'] as Record<string, unknown>
        : undefined,
      fromFile: typeof p['fromFile'] === 'string' ? p['fromFile'] : undefined,
      editorState: p['editorState'] ?? {},
    }))
}

function serializeChangeRegistry(patches: DraftPatch[]): Record<string, unknown> {
  return {
    patches: patches.map((p) => ({
      id: p.id,
      workspace: p.workspace,
      target: p.target,
      action: p.action,
      logName: p.logName,
      enabled: p.enabled,
      when: p.when,
      fromFile: p.fromFile,
      editorState: p.editorState,
    })),
  }
}

function backendToFrontend(record: Awaited<ReturnType<typeof loadGeneratedProjectDraft>>): GeneratedProjectDraft {
  return {
    draftStorageKey: record.draftStorageKey,
    projectMetadata: {
      projectName: record.projectMetadata.projectName,
      projectDescription: record.projectMetadata.projectDescription,
      projectAuthor: record.projectMetadata.projectAuthor,
      projectVersion: record.projectMetadata.projectVersion,
      projectUniqueId: record.projectMetadata.projectUniqueId,
      gameRootPath: record.projectMetadata.gameRootPath,
      contentPackForUniqueId: record.projectMetadata.contentPackForUniqueId,
    },
    overlayTargets: record.overlayTargets.map((t) => ({
      uniqueId: t.uniqueId,
      displayName: t.displayName ?? null,
      required: t.required,
      source: t.source,
    })),
    configSchema: parseConfigSchema(
      (record.configSchemaDraft as Record<string, unknown>) ?? {},
    ),
    patches: parseChangeRegistry(
      (record.serializedChangeRegistry as Record<string, unknown>) ?? {},
    ),
    virtualAssets: [], // virtual assets are managed separately and attached at export time
  }
}

function frontendToBackend(draft: GeneratedProjectDraft): GeneratedProjectDraftRecord {
  return {
    draftStorageKey: draft.draftStorageKey,
    projectMetadata: {
      projectName: draft.projectMetadata.projectName,
      projectDescription: draft.projectMetadata.projectDescription,
      projectAuthor: draft.projectMetadata.projectAuthor,
      projectVersion: draft.projectMetadata.projectVersion,
      projectUniqueId: draft.projectMetadata.projectUniqueId,
      gameRootPath: draft.projectMetadata.gameRootPath,
      contentPackForUniqueId: draft.projectMetadata.contentPackForUniqueId,
    },
    overlayTargets: draft.overlayTargets.map((t) => ({
      uniqueId: t.uniqueId,
      displayName: t.displayName,
      required: t.required,
      source: t.source,
    })),
    configSchemaDraft: serializeConfigSchema(draft.configSchema),
    serializedChangeRegistry: serializeChangeRegistry(draft.patches),
    eventSourceSnapshotsByTarget: {},
    lastDraftSavedAt: null,
    lastExportedAt: null,
    lastExportPath: null,
    lastExportFingerprint: null,
  }
}

/** Normalize When condition values to strings (CP expects string values). */
function normalizeWhen(when: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!when) return undefined
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(when)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'boolean') {
      result[k] = v ? 'true' : 'false'
    } else if (typeof v === 'number') {
      result[k] = String(v)
    } else if (typeof v === 'string') {
      result[k] = v
    } else {
      result[k] = JSON.stringify(v)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function buildConfigJsonAsset(configSchema: ConfigSchemaEntry[]): {
  relativePath: string
  mediaType: string
  bytesBase64: string
} {
  const defaults: Record<string, unknown> = {}
  for (const entry of configSchema) {
    defaults[entry.key] = entry.defaultValue
  }
  const content = `${JSON.stringify(defaults, null, 2)}\n`
  const bytes = new TextEncoder().encode(content)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return {
    relativePath: 'config.json',
    mediaType: 'application/json',
    bytesBase64: btoa(binary),
  }
}

// ─── content.json / manifest.json 前端生成 ───────────────────────────────

export function buildManifestJson(draft: GeneratedProjectDraft): string {
  const meta = draft.projectMetadata
  const manifest: Record<string, unknown> = {
    Name: meta.projectName,
    Author: meta.projectAuthor,
    Version: meta.projectVersion,
    Description: meta.projectDescription,
    UniqueID: meta.projectUniqueId,
    ContentPackFor: { UniqueID: meta.contentPackForUniqueId },
  }

  if (draft.configSchema.length > 0) {
    const schema: Record<string, unknown> = {}
    for (const entry of draft.configSchema) {
      const def: Record<string, unknown> = { Default: entry.defaultValue }
      if (entry.allowValues !== undefined) {
        // CP expects AllowValues as comma-delimited string, not array
        def['AllowValues'] = Array.isArray(entry.allowValues)
          ? entry.allowValues.join(', ')
          : entry.allowValues
      }
      if (entry.description !== undefined) {
        def['Description'] = entry.description
      }
      schema[entry.key] = def
    }
    manifest['ConfigSchema'] = schema
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

export interface ContentBuildResult {
  contentJson: string
  includeFiles: Array<{ relativePath: string; content: string }>
}

export function buildContentJson(draft: GeneratedProjectDraft): ContentBuildResult {
  const activePatches = draft.patches.filter((p) => p.enabled)

  // 按 workspace 分组 changes
  const workspaceChanges = new Map<string, Record<string, unknown>[]>()

  // 合并同 Target + 同 Action (EditData) 的 patch
  const editDataGroups = new Map<string, DraftPatch[]>()
  const standalonePatches: DraftPatch[] = []

  for (const patch of activePatches) {
    if (patch.action === 'EditData') {
      const key = `${patch.workspace}:${patch.target}`
      const group = editDataGroups.get(key) ?? []
      group.push(patch)
      editDataGroups.set(key, group)
    } else {
      standalonePatches.push(patch)
    }
  }

  // 合并 EditData
  for (const [, patches] of editDataGroups) {
    const ws = patches[0]!.workspace
    const changes = workspaceChanges.get(ws) ?? []

    const change: Record<string, unknown> = {
      Action: 'EditData',
      Target: patches[0]!.target,
    }

    // 合并 Entries
    const entries: Record<string, unknown> = {}
    for (const patch of patches) {
      const state = patch.editorState as Record<string, unknown> | undefined
      if (state?.['entries'] && typeof state['entries'] === 'object' && state['entries'] !== null) {
        Object.assign(entries, state['entries'])
      }
    }
    if (Object.keys(entries).length > 0) {
      change['Entries'] = entries
    }

    const when = normalizeWhen(patches[0]?.when)
    if (when) {
      change['When'] = when
    }

    changes.push(change)
    workspaceChanges.set(ws, changes)
  }

  // 独立 patch (EditImage, EditMap, Load)
  for (const patch of standalonePatches) {
    const changes = workspaceChanges.get(patch.workspace) ?? []

    const change: Record<string, unknown> = {
      Action: patch.action,
      Target: patch.target,
      LogName: patch.logName,
    }
    if (patch.fromFile) {
      change['FromFile'] = patch.fromFile
    }
    if (patch.when) {
      change['When'] = patch.when
    }
    const state = patch.editorState as Record<string, unknown> | undefined
    if (state) {
      for (const [k, v] of Object.entries(state)) {
        if (k === 'entries') continue
        // Map internal field names to CP field names
        if (patch.action === 'EditMap' && k === 'properties') {
          change['MapProperties'] = v
        } else if (patch.action === 'EditMap' && k === 'warps') {
          // Convert structured warps to CP's AddWarps string format
          if (Array.isArray(v)) {
            change['AddWarps'] = v.map((w: Record<string, unknown>) =>
              `${w['fromX']} ${w['fromY']} ${w['toMap']} ${w['toX']} ${w['toY']}`
            )
          }
        } else {
          change[k] = v
        }
      }
    }

    changes.push(change)
    workspaceChanges.set(patch.workspace, changes)
  }

  // 生成各 workspace 的 include 文件
  const includeFiles: Array<{ relativePath: string; content: string }> = []
  const allChanges: Record<string, unknown>[] = []

  for (const [ws, changes] of workspaceChanges) {
    if (changes.length === 0) continue
    const relativePath = `changes/${ws}.json`

    // Include patch must be in Changes array as a regular patch entry
    allChanges.push({
      Action: 'Include',
      FromFile: relativePath,
      LogName: `Include ${ws} changes`,
    })

    // Append actual changes
    allChanges.push(...changes)

    includeFiles.push({
      relativePath,
      content: `${JSON.stringify({ Changes: changes }, null, 2)}\n`,
    })
  }

  const content = {
    Format: '2.0.0',
    Changes: allChanges,
  }

  return {
    contentJson: `${JSON.stringify(content, null, 2)}\n`,
    includeFiles,
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────

let nextPatchId = 0
function generatePatchId() {
  nextPatchId += 1
  return `patch-${Date.now()}-${nextPatchId}`
}

export function useGeneratedProject() {
  const [drafts, setDrafts] = useState<GeneratedProjectDraftSummary[]>([])
  const [activeDraft, setActiveDraft] = useState<GeneratedProjectDraft | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const isDirtyRef = useRef(false)

  // 保持 ref 同步
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // 加载草稿列表
  const refreshDrafts = useCallback(async () => {
    try {
      const list = await listGeneratedProjectDrafts()
      setDrafts(list)
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  // 初始加载草稿列表
  useEffect(() => {
    void refreshDrafts()
  }, [refreshDrafts])

  // 加载指定草稿
  const loadDraft = useCallback(async (storageKey: string) => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = await loadGeneratedProjectDraft(storageKey)
      setActiveDraft(backendToFrontend(record))
      setIsDirty(false)
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
      setActiveDraft(null)
    } finally {
      setDraftLoading(false)
    }
  }, [])

  // 创建新草稿
  const createDraft = useCallback(async (metadata: Partial<GeneratedProjectDraft['projectMetadata']>) => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const newDraft: GeneratedProjectDraft = {
        draftStorageKey: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        projectMetadata: {
          projectName: metadata.projectName ?? 'Untitled Mod',
          projectDescription: metadata.projectDescription ?? '',
          projectAuthor: metadata.projectAuthor ?? '',
          projectVersion: metadata.projectVersion ?? '1.0.0',
          projectUniqueId: metadata.projectUniqueId ?? `YourName.UntitledMod`,
          gameRootPath: metadata.gameRootPath ?? null,
          contentPackForUniqueId: metadata.contentPackForUniqueId ?? 'Pathoschild.ContentPatcher',
        },
        overlayTargets: [],
        configSchema: [],
        patches: [],
        virtualAssets: [],
      }
      const record = frontendToBackend(newDraft)
      await saveGeneratedProjectDraft(record)
      setActiveDraft(newDraft)
      setIsDirty(false)
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [refreshDrafts])

  // 保存草稿
  const saveDraft = useCallback(async () => {
    if (!activeDraft) return
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = frontendToBackend(activeDraft)
      await saveGeneratedProjectDraft(record)
      setIsDirty(false)
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [activeDraft, refreshDrafts])

  // 删除草稿
  const deleteDraft = useCallback(async (storageKey: string) => {
    try {
      await deleteGeneratedProjectDraft(storageKey)
      if (activeDraft?.draftStorageKey === storageKey) {
        setActiveDraft(null)
        setIsDirty(false)
      }
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    }
  }, [activeDraft, refreshDrafts])

  // 复制草稿
  const copyDraft = useCallback(async (storageKey: string) => {
    setDraftLoading(true)
    try {
      const record = await copyGeneratedProjectDraft({
        source_draft_storage_key: storageKey,
      })
      const copied = backendToFrontend(record)
      setActiveDraft(copied)
      setIsDirty(false)
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [refreshDrafts])

  // ── Patch 管理 ──

  const addPatchWithReturn = useCallback(
    (workspace: WorkspaceId, target: string, action: DraftPatch['action']): string => {
      const id = generatePatchId()
      setActiveDraft((current) => {
        if (!current) return current
        const newPatch: DraftPatch = {
          id,
          workspace,
          target,
          action,
          logName: `${action} → ${target}`,
          enabled: true,
          editorState: {},
        }
        return { ...current, patches: [...current.patches, newPatch] }
      })
      setIsDirty(true)
      return id
    },
    [],
  )

  const removePatch = useCallback((patchId: string) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        patches: current.patches.filter((p) => p.id !== patchId),
      }
    })
    setIsDirty(true)
  }, [])

  const updatePatch = useCallback((patchId: string, patch: Partial<DraftPatch>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        patches: current.patches.map((p) =>
          p.id === patchId ? { ...p, ...patch } : p,
        ),
      }
    })
    setIsDirty(true)
  }, [])

  const getPatchesForWorkspace = useCallback(
    (workspaceId: WorkspaceId) => {
      return activeDraft?.patches.filter((p) => p.workspace === workspaceId) ?? []
    },
    [activeDraft],
  )

  // ── Config Schema 管理 ──

  const addConfigEntry = useCallback((entry: ConfigSchemaEntry) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        configSchema: [...current.configSchema, entry],
      }
    })
    setIsDirty(true)
  }, [])

  const removeConfigEntry = useCallback((key: string) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        configSchema: current.configSchema.filter((e) => e.key !== key),
      }
    })
    setIsDirty(true)
  }, [])

  const updateConfigEntry = useCallback((key: string, patch: Partial<ConfigSchemaEntry>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        configSchema: current.configSchema.map((e) =>
          e.key === key ? { ...e, ...patch } : e,
        ),
      }
    })
    setIsDirty(true)
  }, [])

  // ── Virtual Asset 管理 ──

  const addVirtualAsset = useCallback((asset: VirtualPreviewAsset) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        virtualAssets: [...current.virtualAssets.filter((a) => a.relativePath !== asset.relativePath), asset],
      }
    })
    setIsDirty(true)
  }, [])

  const removeVirtualAsset = useCallback((relativePath: string) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        virtualAssets: current.virtualAssets.filter((a) => a.relativePath !== relativePath),
      }
    })
    setIsDirty(true)
  }, [])

  // ── Metadata ──

  const updateMetadata = useCallback((patch: Partial<GeneratedProjectDraft['projectMetadata']>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        projectMetadata: { ...current.projectMetadata, ...patch },
      }
    })
    setIsDirty(true)
  }, [])

  // ── Export ──

  const exportPack = useCallback(
    async (outputPath: string): Promise<GeneratedProjectExportResult> => {
      if (!activeDraft) {
        throw new Error('No active draft to export.')
      }
      const manifestJson = buildManifestJson(activeDraft)
      const { contentJson, includeFiles } = buildContentJson(activeDraft)

      // Include 文件作为 virtual assets 传入
      const includeAssets = includeFiles.map((file) => {
        const bytes = new TextEncoder().encode(file.content)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!)
        }
        return {
          relativePath: file.relativePath,
          mediaType: 'application/json',
          bytesBase64: btoa(binary),
        }
      })

      // config.json 默认值文件（当 ConfigSchema 存在时）
      const configAssets = activeDraft.configSchema.length > 0
        ? [buildConfigJsonAsset(activeDraft.configSchema)]
        : []

      return exportGeneratedProjectPack({
        output_path: outputPath,
        manifest_json: manifestJson,
        content_json: contentJson,
        virtual_assets: [...activeDraft.virtualAssets, ...includeAssets, ...configAssets],
      })
    },
    [activeDraft],
  )

  // ── Derived ──

  const patchCountByWorkspace = useMemo(() => {
    const counts: Partial<Record<WorkspaceId, number>> = {}
    for (const patch of activeDraft?.patches ?? []) {
      counts[patch.workspace] = (counts[patch.workspace] ?? 0) + 1
    }
    return counts
  }, [activeDraft?.patches])

  return {
    // Draft CRUD
    drafts,
    activeDraft,
    draftLoading,
    draftError,
    isDirty,
    createDraft,
    loadDraft,
    saveDraft,
    deleteDraft,
    copyDraft,
    refreshDrafts,

    // Patch 管理
    addPatch: addPatchWithReturn,
    removePatch,
    updatePatch,
    getPatchesForWorkspace,

    // Config Schema
    configSchema: activeDraft?.configSchema ?? [],
    addConfigEntry,
    removeConfigEntry,
    updateConfigEntry,

    // Virtual Assets
    virtualAssets: activeDraft?.virtualAssets ?? [],
    addVirtualAsset,
    removeVirtualAsset,

    // Metadata
    updateMetadata,

    // Build / Export
    buildManifestJson,
    buildContentJson,
    exportPack,

    // Derived
    patchCountByWorkspace,
  }
}

export type UseGeneratedProjectReturn = ReturnType<typeof useGeneratedProject>
