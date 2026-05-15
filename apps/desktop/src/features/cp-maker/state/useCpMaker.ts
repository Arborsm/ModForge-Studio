import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCpMakerPort } from '@features/cp-maker'
import type { CpMakerPort } from '@features/cp-maker'
import type {
  ConfigSchemaEntry,
  DraftPatch,
  CpMakerDraft,
  VirtualPreviewAsset,
  WorkspaceId,
} from '@shared/contracts'
import type {
  CpMakerDraftRecord,
  CpMakerDraftSummary,
  CpMakerExportResult,
} from '../model/cpMakerPort'

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
        allowValues: typeof def['AllowValues'] === 'string' ? def['AllowValues'] : undefined,
        description: typeof def['Description'] === 'string' ? def['Description'] : undefined,
        allowBlank: typeof def['AllowBlank'] === 'boolean' ? def['AllowBlank'] : undefined,
        allowMultiple: typeof def['AllowMultiple'] === 'boolean' ? def['AllowMultiple'] : undefined,
        section: typeof def['Section'] === 'string' ? def['Section'] : undefined,
      }
    })
}

function serializeConfigSchema(entries: ConfigSchemaEntry[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    const def: Record<string, unknown> = { Default: entry.defaultValue }
    if (entry.allowValues !== undefined && entry.allowValues !== '') {
      def['AllowValues'] = entry.allowValues
    }
    if (entry.description !== undefined && entry.description !== '') {
      def['Description'] = entry.description
    }
    if (entry.allowBlank !== undefined) {
      def['AllowBlank'] = entry.allowBlank
    }
    if (entry.allowMultiple !== undefined) {
      def['AllowMultiple'] = entry.allowMultiple
    }
    if (entry.section !== undefined && entry.section !== '') {
      def['Section'] = entry.section
    }
    result[entry.key] = def
  }
  return result
}

function fallbackPatchId(patch: Pick<DraftPatch, 'action' | 'target' | 'fromFile'>, index: number): string {
  const target = patch.action === 'Include' ? patch.fromFile : patch.target
  return `${patch.action}:${target || `patch-${index + 1}`}`
}

function ensureUniquePatchIds(patches: DraftPatch[]): DraftPatch[] {
  const seen = new Set<string>()

  return patches.map((patch, index) => {
    const baseId = patch.id.trim() || fallbackPatchId(patch, index)
    let id = baseId
    let suffix = 2

    while (seen.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }

    seen.add(id)
    return id === patch.id ? patch : { ...patch, id }
  })
}

function parseChangeRegistry(serialized: Record<string, unknown>): DraftPatch[] {
  const patches = Array.isArray(serialized['patches']) ? serialized['patches'] : []
  const parsed = patches
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p))
    .map((p) => {
      const rawTargetField = p['targetField']
      return {
        id: String(p['id'] ?? ''),
        workspace: String(p['workspace'] ?? 'map') as WorkspaceId,
        target: String(p['target'] ?? ''),
        action: String(p['action'] ?? 'EditData') as DraftPatch['action'],
        logName: String(p['logName'] ?? ''),
        enabled: typeof p['enabled'] === 'boolean'
          ? p['enabled']
          : typeof p['enabled'] === 'string'
            ? p['enabled']
            : true,
        updatedAt: typeof p['updatedAt'] === 'number' ? p['updatedAt'] : undefined,
        when: typeof p['when'] === 'object' && p['when'] !== null && !Array.isArray(p['when'])
          ? p['when'] as Record<string, unknown>
          : undefined,
        fromFile: typeof p['fromFile'] === 'string' ? p['fromFile'] : undefined,
        editorState: p['editorState'] ?? {},
        targetLocale: typeof p['targetLocale'] === 'string' ? p['targetLocale'] : undefined,
        update: typeof p['update'] === 'string' ? p['update'] : undefined,
        priority: typeof p['priority'] === 'string' || typeof p['priority'] === 'number' ? p['priority'] : undefined,
        localTokens: typeof p['localTokens'] === 'object' && p['localTokens'] !== null && !Array.isArray(p['localTokens'])
          ? p['localTokens'] as Record<string, unknown>
          : undefined,
        targetField: Array.isArray(rawTargetField)
          ? rawTargetField.filter((v): v is string => typeof v === 'string')
          : undefined,
      }
    })
  return ensureUniquePatchIds(parsed)
}

function serializeChangeRegistry(patches: DraftPatch[]): Record<string, unknown> {
  return {
    patches: patches.map((p) => {
      const result: Record<string, unknown> = {
        id: p.id,
        workspace: p.workspace,
        target: p.target,
        action: p.action,
        logName: p.logName,
        enabled: p.enabled,
        when: p.when,
        fromFile: p.fromFile,
        editorState: p.editorState,
        targetLocale: p.targetLocale,
        update: p.update,
        priority: p.priority,
        localTokens: p.localTokens,
      }
      if (p.targetField !== undefined && p.targetField.length > 0) {
        result['targetField'] = p.targetField
      }
      if (p.updatedAt !== undefined) {
        result['updatedAt'] = p.updatedAt
      }
      return result
    }),
  }
}

function backendToFrontend(record: CpMakerDraftRecord): CpMakerDraft {
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
      minimumApiVersion: record.projectMetadata.minimumApiVersion ?? undefined,
      updateKeys: record.projectMetadata.updateKeys ?? undefined,
    } as CpMakerDraft['projectMetadata'],
    overlayTargets: record.overlayTargets.map((t: { uniqueId: string; displayName: string | null; required: boolean; source: 'scanned-mod' | 'manual' }) => ({
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
    dynamicTokens: (record.dynamicTokens as Array<{ name: string; value: string; when?: Record<string, unknown> }> | undefined) ?? [],
    customLocations: (record.customLocations as Array<{ name: string; fromMapFile: string; migrateLegacyNames?: string[] }> | undefined) ?? [],
    aliasTokenNames: (record.aliasTokenNames as Record<string, string> | undefined) ?? {},
    eventSourceSnapshotsByTarget:
      (record.eventSourceSnapshotsByTarget as Record<string, { rawScriptsByKey: Record<string, string> }> | undefined) ?? {},
  }
}

function frontendToBackend(draft: CpMakerDraft): CpMakerDraftRecord {
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
      ...(draft.projectMetadata.minimumApiVersion ? { minimumApiVersion: draft.projectMetadata.minimumApiVersion } : {}),
      ...(draft.projectMetadata.updateKeys && draft.projectMetadata.updateKeys.length > 0 ? { updateKeys: draft.projectMetadata.updateKeys } : {}),
    },
    overlayTargets: draft.overlayTargets.map((t) => ({
      uniqueId: t.uniqueId,
      displayName: t.displayName,
      required: t.required,
      source: t.source,
    })),
    configSchemaDraft: serializeConfigSchema(draft.configSchema),
    serializedChangeRegistry: serializeChangeRegistry(draft.patches),
    dynamicTokens: draft.dynamicTokens.map((t) => ({
      name: t.name,
      value: t.value,
      ...(t.when && Object.keys(t.when).length > 0 ? { when: t.when } : {}),
    })),
    customLocations: draft.customLocations,
    aliasTokenNames: draft.aliasTokenNames,
    eventSourceSnapshotsByTarget: draft.eventSourceSnapshotsByTarget,
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

function encodeTextToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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
  return {
    relativePath: 'config.json',
    mediaType: 'application/json',
    bytesBase64: encodeTextToBase64(content),
  }
}

// ─── content.json / manifest.json 前端生成 ───────────────────────────────

export function buildManifestJson(draft: CpMakerDraft): string {
  const meta = draft.projectMetadata
  const manifest: Record<string, unknown> = {
    Name: meta.projectName,
    Author: meta.projectAuthor,
    Version: meta.projectVersion,
    Description: meta.projectDescription,
    UniqueID: meta.projectUniqueId,
    ContentPackFor: { UniqueID: meta.contentPackForUniqueId },
  }
  if (meta.minimumApiVersion) {
    manifest['MinimumApiVersion'] = meta.minimumApiVersion
  }
  if (meta.updateKeys && meta.updateKeys.length > 0) {
    manifest['UpdateKeys'] = meta.updateKeys
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

export interface ContentBuildResult {
  contentJson: string
  includeFiles: Array<{ relativePath: string; content: string }>
}

/** Map camelCase object keys to PascalCase for CP JSON output. */
function mapKeysToPascalCase(obj: Record<string, unknown>, keyMap: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    result[keyMap[k] ?? k] = v
  }
  return result
}

const TEXT_OP_KEY_MAP: Record<string, string> = {
  operation: 'Operation',
  target: 'Target',
  value: 'Value',
  delimiter: 'Delimiter',
  search: 'Search',
  replaceMode: 'ReplaceMode',
}

const MOVE_ENTRY_KEY_MAP: Record<string, string> = {
  id: 'ID',
  beforeId: 'BeforeId',
  afterId: 'AfterId',
  toPosition: 'ToPosition',
}

export function buildContentJson(draft: CpMakerDraft): ContentBuildResult {
  // enabled can be boolean or string token (e.g. "{{EnableMapEdit}}")
  // CP treats "false" (any case) as disabled; everything else is a token or enabled.
  const activePatches = draft.patches.filter((p) => {
    if (p.enabled === false) return false
    if (typeof p.enabled === 'string' && p.enabled.toLowerCase() === 'false') return false
    return true
  })

  // 按 workspace 分组 changes
  const workspaceChanges = new Map<string, Record<string, unknown>[]>()

  // 合并同 Target + 同 Action + 同 PatchConfig (When/Enabled/Priority 等) 的 EditData patch
  // 避免不同条件的 patch 被合并后丢失条件信息
  const editDataGroups = new Map<string, DraftPatch[]>()
  const standalonePatches: DraftPatch[] = []

  function getEditDataMergeKey(patch: DraftPatch): string {
    const parts = [
      patch.workspace,
      patch.target,
      typeof patch.enabled === 'string' ? patch.enabled : String(patch.enabled),
      patch.when ? JSON.stringify(normalizeWhen(patch.when)) : '',
      patch.targetLocale ?? '',
      patch.update ?? '',
      String(patch.priority ?? ''),
      patch.localTokens ? JSON.stringify(patch.localTokens) : '',
      patch.targetField ? JSON.stringify(patch.targetField) : '',
    ]
    return parts.join('\0')
  }

  for (const patch of activePatches) {
    if (patch.action === 'EditData') {
      const key = getEditDataMergeKey(patch)
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
    // 合并 Fields (EntryKey -> { FieldName -> Value })
    const fields: Record<string, Record<string, unknown>> = {}
    // 收集 TextOperations
    const textOperations: unknown[] = []
    for (const patch of patches) {
      const state = patch.editorState as Record<string, unknown> | undefined
      if (state?.['entries'] && typeof state['entries'] === 'object' && state['entries'] !== null) {
        Object.assign(entries, state['entries'])
      }
      if (state?.['fields'] && typeof state['fields'] === 'object' && state['fields'] !== null) {
        const patchFields = state['fields'] as Record<string, Record<string, unknown>>
        for (const [entryKey, fieldMap] of Object.entries(patchFields)) {
          if (!fields[entryKey]) {
            fields[entryKey] = {}
          }
          Object.assign(fields[entryKey], fieldMap)
        }
      }
      if (state?.['textOperations'] && Array.isArray(state['textOperations'])) {
        textOperations.push(...state['textOperations'])
      }
    }
    if (Object.keys(entries).length > 0) {
      change['Entries'] = entries
    }
    if (Object.keys(fields).length > 0) {
      change['Fields'] = fields
    }
    if (textOperations.length > 0) {
      change['TextOperations'] = textOperations.map((op) =>
        mapKeysToPascalCase(op as Record<string, unknown>, TEXT_OP_KEY_MAP)
      )
    }
    // 收集 MoveEntries（CP 格式为数组 { ID, BeforeId, AfterId, ToPosition }）
    const moveEntries: unknown[] = []
    for (const patch of patches) {
      const state = patch.editorState as Record<string, unknown> | undefined
      if (state?.['moveEntries'] && Array.isArray(state['moveEntries'])) {
        moveEntries.push(...state['moveEntries'])
      }
    }
    if (moveEntries.length > 0) {
      change['MoveEntries'] = moveEntries.map((entry) =>
        mapKeysToPascalCase(entry as Record<string, unknown>, MOVE_ENTRY_KEY_MAP)
      )
    }

    // CP PatchConfig common fields from first patch
    const first = patches[0]
    if (first) {
      if (first.logName) change['LogName'] = first.logName
      if (typeof first.enabled === 'string') change['Enabled'] = first.enabled
      // Note: EditData cannot use FromFile when Format >= 1.18 (we use 2.9.0)
      const when = normalizeWhen(first.when)
      if (when) change['When'] = when
      if (first.targetLocale) change['TargetLocale'] = first.targetLocale
      if (first.update) change['Update'] = first.update
      if (first.priority !== undefined) change['Priority'] = first.priority
      if (first.localTokens) change['LocalTokens'] = first.localTokens
      if (first.targetField !== undefined && first.targetField.length > 0) change['TargetField'] = first.targetField
    }

    // Skip empty EditData changes: CP requires at least one of Entries/Fields/MoveEntries/TextOperations or FromFile
    if (!change['Entries'] && !change['Fields'] && !change['TextOperations'] && !change['MoveEntries'] && !change['FromFile']) {
      continue
    }
    changes.push(change)
    workspaceChanges.set(ws, changes)
  }

  // 独立 patch (EditImage, EditMap, Load)
  for (const patch of standalonePatches) {
    const changes = workspaceChanges.get(patch.workspace) ?? []

    const change: Record<string, unknown> = {
      Action: patch.action,
    }
    if (patch.action !== 'Include') {
      change['Target'] = patch.target
    }
    if (patch.logName) {
      change['LogName'] = patch.logName
    }
    if (typeof patch.enabled === 'string') {
      change['Enabled'] = patch.enabled
    }
    if (patch.fromFile) {
      change['FromFile'] = patch.fromFile
    }
    const when = normalizeWhen(patch.when)
    if (when) {
      change['When'] = when
    }
    if (patch.targetLocale) {
      change['TargetLocale'] = patch.targetLocale
    }
    if (patch.update) {
      change['Update'] = patch.update
    }
    if (patch.priority !== undefined) {
      change['Priority'] = patch.priority
    }
    if (patch.localTokens) {
      change['LocalTokens'] = patch.localTokens
    }
    if (patch.targetField !== undefined && patch.targetField.length > 0) {
      change['TargetField'] = patch.targetField
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
        } else if (patch.action === 'EditMap' && k === 'npcWarps') {
          // Convert structured npc warps to CP's AddNpcWarps string format
          if (Array.isArray(v)) {
            change['AddNpcWarps'] = v.map((w: Record<string, unknown>) =>
              `${w['fromX']} ${w['fromY']} ${w['toMap']} ${w['toX']} ${w['toY']}`
            )
          }
        } else if (patch.action === 'EditMap' && k === 'mapTiles') {
          // Convert structured map tiles to CP's MapTiles format
          if (Array.isArray(v)) {
            change['MapTiles'] = v.map((t: Record<string, unknown>) => {
              const mapPosValue = (val: unknown): number | string => {
                if (typeof val === 'number') return val
                if (typeof val === 'string') {
                  const num = Number(val)
                  return Number.isNaN(num) ? val : num
                }
                return 0
              }
              const tile: Record<string, unknown> = {
                Layer: t['layer'],
                Position: { X: mapPosValue(t['x']), Y: mapPosValue(t['y']) },
              }
              if (t['setTilesheet'] !== undefined && t['setTilesheet'] !== '') {
                tile['SetTilesheet'] = t['setTilesheet']
              }
              if (t['setIndex'] !== undefined) {
                tile['SetIndex'] = t['setIndex']
              }
              if (t['remove'] === true) {
                tile['Remove'] = 'true'
              }
              if (t['setProperties'] && typeof t['setProperties'] === 'object') {
                tile['SetProperties'] = t['setProperties']
              }
              return tile
            })
          }
        } else if ((k === 'fromArea' || k === 'toArea') && v && typeof v === 'object') {
          // Convert all area keys to CP PascalCase (e.g. x->X, width->Width) preserving extra fields
          const area = v as Record<string, unknown>
          const mapAreaValue = (val: unknown): number | string => {
            if (typeof val === 'number') return val
            if (typeof val === 'string') {
              const num = Number(val)
              return Number.isNaN(num) ? val : num
            }
            return 0
          }
          const pascalCase = (s: string): string => s ? s[0].toUpperCase() + s.slice(1) : s
          const mappedArea: Record<string, number | string> = {}
          for (const [areaKey, areaVal] of Object.entries(area)) {
            mappedArea[pascalCase(areaKey)] = mapAreaValue(areaVal)
          }
          change[k === 'fromArea' ? 'FromArea' : 'ToArea'] = mappedArea
        } else if (k === 'patchMode') {
          change['PatchMode'] = v
        } else if (k === 'textOperations' && Array.isArray(v)) {
          change['TextOperations'] = v.map((op) =>
            mapKeysToPascalCase(op as Record<string, unknown>, TEXT_OP_KEY_MAP)
          )
        } else if (k === 'moveEntries' && Array.isArray(v)) {
          change['MoveEntries'] = v.map((entry) =>
            mapKeysToPascalCase(entry as Record<string, unknown>, MOVE_ENTRY_KEY_MAP)
          )
        } else {
          change[k] = v
        }
      }
    }

    // Validate patch has required content for its action
    const action = patch.action
    if (action === 'EditImage' && !change['FromFile']) {
      continue // CP requires FromFile for EditImage
    }
    if (action === 'Load' && !change['FromFile']) {
      continue // CP requires FromFile for Load
    }
    if (action === 'EditMap') {
      const hasContent = change['MapProperties'] || change['AddWarps'] || change['AddNpcWarps'] || change['MapTiles'] || change['TextOperations'] || change['FromFile']
      if (!hasContent) {
        continue // CP requires at least one of MapProperties/AddWarps/AddNpcWarps/MapTiles/TextOperations/FromFile for EditMap
      }
    }
    if (action === 'Include' && !change['FromFile']) {
      continue // CP requires FromFile for Include
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

    // Include patch references the per-workspace changes file
    allChanges.push({
      Action: 'Include',
      FromFile: relativePath,
    })

    includeFiles.push({
      relativePath,
      content: `${JSON.stringify({ Changes: changes }, null, 2)}\n`,
    })
  }

  const content: Record<string, unknown> = {
    Format: '2.9.0',
    Changes: allChanges,
  }
  if (draft.configSchema.length > 0) {
    content['ConfigSchema'] = serializeConfigSchema(draft.configSchema)
  }
  if (draft.dynamicTokens.length > 0) {
    content['DynamicTokens'] = draft.dynamicTokens.map((t) => {
      const result: Record<string, unknown> = { Name: t.name, Value: t.value }
      const when = normalizeWhen(t.when)
      if (when) {
        result['When'] = when
      }
      return result
    })
  }
  if (draft.customLocations.length > 0) {
    content['CustomLocations'] = draft.customLocations.map((loc) => {
      const result: Record<string, unknown> = {
        Name: loc.name,
        FromMapFile: loc.fromMapFile,
      }
      if (loc.migrateLegacyNames && loc.migrateLegacyNames.length > 0) {
        result['MigrateLegacyNames'] = loc.migrateLegacyNames
      }
      return result
    })
  }
  if (Object.keys(draft.aliasTokenNames).length > 0) {
    content['AliasTokenNames'] = draft.aliasTokenNames
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

function isDefaultPatchConfig(patch: DraftPatch) {
  return !patch.when
    && !patch.targetLocale
    && !patch.update
    && !patch.priority
    && !patch.localTokens
    && (!patch.targetField || patch.targetField.length === 0)
}

function isSameDefaultPatch(patch: DraftPatch, workspace: WorkspaceId, target: string, action: DraftPatch['action'], fromFile?: string) {
  if (!isDefaultPatchConfig(patch) || patch.workspace !== workspace || patch.action !== action) {
    return false
  }
  if (action === 'Include') {
    return (patch.fromFile ?? '') === (fromFile ?? '')
  }
  return patch.target === target
}

export function useCpMaker() {
  const port: CpMakerPort = useCpMakerPort()
  const [drafts, setDrafts] = useState<CpMakerDraftSummary[]>([])
  const [activeDraft, setActiveDraft] = useState<CpMakerDraft | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [dirtyPatchIds, setDirtyPatchIds] = useState<Set<string>>(() => new Set())
  const isDirtyRef = useRef(false)

  // 保持 ref 同步
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // 加载草稿列表
  const refreshDrafts = useCallback(async () => {
    try {
      const list = await port.listDrafts()
      setDrafts(list)
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    }
  }, [port])

  // 初始加载草稿列表
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const list = await port.listDrafts()
        if (!cancelled) {
          setDrafts(list)
        }
      } catch (error) {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : String(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [port])

  // 加载指定草稿
  const loadDraft = useCallback(async (storageKey: string) => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = await port.loadDraft(storageKey)
      setActiveDraft(backendToFrontend(record))
      setIsDirty(false)
      setDirtyPatchIds(new Set())
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
      setActiveDraft(null)
      setDirtyPatchIds(new Set())
    } finally {
      setDraftLoading(false)
    }
  }, [port])

  // 创建新草稿
  const createDraft = useCallback(async (metadata: Partial<CpMakerDraft['projectMetadata']>) => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const newDraft: CpMakerDraft = {
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
        dynamicTokens: [],
        customLocations: [],
        aliasTokenNames: {},
        eventSourceSnapshotsByTarget: {},
      }
      const record = frontendToBackend(newDraft)
      await port.saveDraft(record)
      setActiveDraft(newDraft)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [port, refreshDrafts])

  // 保存草稿
  const saveDraft = useCallback(async () => {
    if (!activeDraft) return
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = frontendToBackend(activeDraft)
      await port.saveDraft(record)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [activeDraft, port, refreshDrafts])

  // 删除草稿
  const deleteDraft = useCallback(async (storageKey: string) => {
    try {
      await port.deleteDraft(storageKey)
      if (activeDraft?.draftStorageKey === storageKey) {
        setActiveDraft(null)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
      }
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    }
  }, [activeDraft, port, refreshDrafts])

  // 复制草稿
  const copyDraft = useCallback(async (storageKey: string) => {
    setDraftLoading(true)
    try {
      const record = await port.copyDraft(storageKey)
      const copied = backendToFrontend(record)
      setActiveDraft(copied)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      await refreshDrafts()
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
    } finally {
      setDraftLoading(false)
    }
  }, [port, refreshDrafts])

  // ── Patch 管理 ──

  const addPatchWithReturn = useCallback(
    (workspace: WorkspaceId, target: string, action: DraftPatch['action'], fromFile?: string): string => {
      const existingPatch = activeDraft?.patches.find((patch) => isSameDefaultPatch(patch, workspace, target, action, fromFile))
      if (existingPatch) {
        return existingPatch.id
      }

      const id = generatePatchId()
      const updatedAt = Date.now()
      setActiveDraft((current) => {
        if (!current) return current
        if (current.patches.some((patch) => isSameDefaultPatch(patch, workspace, target, action, fromFile))) {
          return current
        }
        const newPatch: DraftPatch = {
          id,
          workspace,
          target: action === 'Include' ? '' : target,
          action,
          logName: action === 'Include' ? `Include → ${fromFile ?? ''}` : `${action} → ${target}`,
          enabled: true,
          updatedAt,
          editorState: {},
          ...(fromFile ? { fromFile } : {}),
        }
        return { ...current, patches: [...current.patches, newPatch] }
      })
      setIsDirty(true)
      setDirtyPatchIds((current) => new Set(current).add(id))
      return id
    },
    [activeDraft],
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
    setDirtyPatchIds((current) => {
      const next = new Set(current)
      next.delete(patchId)
      return next
    })
  }, [])

  const updatePatch = useCallback((patchId: string, patch: Partial<DraftPatch>) => {
    const updatedAt = Date.now()
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        patches: current.patches.map((p) =>
          p.id === patchId ? { ...p, ...patch, updatedAt } : p,
        ),
      }
    })
    setIsDirty(true)
    setDirtyPatchIds((current) => new Set(current).add(patchId))
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

  // ── CustomLocations 管理 ──

  const setCustomLocations = useCallback((locations: Array<{ name: string; fromMapFile?: string; migrateLegacyNames?: string[] }>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return { ...current, customLocations: locations }
    })
    setIsDirty(true)
  }, [])

  // ── DynamicTokens 管理 ──

  const setDynamicTokens = useCallback((tokens: Array<{ name: string; value: string; when?: Record<string, unknown> }>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return { ...current, dynamicTokens: tokens }
    })
    setIsDirty(true)
  }, [])

  // ── AliasTokenNames 管理 ──

  const addAliasTokenName = useCallback((alias: string, tokenName: string) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        aliasTokenNames: { ...current.aliasTokenNames, [alias]: tokenName },
      }
    })
    setIsDirty(true)
  }, [])

  const removeAliasTokenName = useCallback((alias: string) => {
    setActiveDraft((current) => {
      if (!current) return current
      const next = { ...current.aliasTokenNames }
      delete next[alias]
      return { ...current, aliasTokenNames: next }
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

  const updateMetadata = useCallback((patch: Partial<CpMakerDraft['projectMetadata']>) => {
    setActiveDraft((current) => {
      if (!current) return current
      return {
        ...current,
        projectMetadata: { ...current.projectMetadata, ...patch },
      }
    })
    setIsDirty(true)
  }, [])

  // ── Import ──

  const importPack = useCallback(async (modDirectoryPath: string) => {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = await port.importPack(modDirectoryPath)
      const draft = backendToFrontend(record)
      setActiveDraft(draft)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      await refreshDrafts()
      return draft
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      setDraftLoading(false)
    }
  }, [port, refreshDrafts])

  // ── Export ──

  const exportPack = useCallback(
    async (outputPath: string): Promise<CpMakerExportResult> => {
      if (!activeDraft) {
        throw new Error('No active draft to export.')
      }
      const manifestJson = buildManifestJson(activeDraft)
      const { contentJson, includeFiles } = buildContentJson(activeDraft)

      // Include 文件作为 virtual assets 传入
      const includeAssets = includeFiles.map((file) => ({
        relativePath: file.relativePath,
        mediaType: 'application/json',
        bytesBase64: encodeTextToBase64(file.content),
      }))

      // config.json 默认值文件（当 ConfigSchema 存在时）
      const configAssets = activeDraft.configSchema.length > 0
        ? [buildConfigJsonAsset(activeDraft.configSchema)]
        : []

      return port.exportPack({
        output_path: outputPath,
        manifest_json: manifestJson,
        content_json: contentJson,
        virtual_assets: [...activeDraft.virtualAssets, ...includeAssets, ...configAssets],
      })
    },
    [activeDraft, port],
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
    dirtyPatchIds,
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

    // CustomLocations
    customLocations: activeDraft?.customLocations ?? [],
    setCustomLocations,

    // DynamicTokens
    dynamicTokens: activeDraft?.dynamicTokens ?? [],
    setDynamicTokens,

    // AliasTokenNames
    aliasTokenNames: activeDraft?.aliasTokenNames ?? {},
    addAliasTokenName,
    removeAliasTokenName,

    // Metadata
    updateMetadata,

    // Import
    importPack,

    // Build / Export
    buildManifestJson,
    buildContentJson,
    exportPack,

    // Derived
    patchCountByWorkspace,
  }
}

export type UseCpMakerReturn = ReturnType<typeof useCpMaker>
