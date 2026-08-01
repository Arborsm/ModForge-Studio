import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCpMakerPort } from '@features/cp-maker/provider'
import type { CpMakerPort } from '@features/cp-maker/provider'
import type {
  ConfigSchemaEntry,
  CpMakerDependency,
  DraftPatch,
  CpMakerDraft,
  ProjectAssetRef,
  VirtualPreviewAsset,
  WorkspaceId,
} from '@features/cp-maker'
import type { DialogFilter } from '@shared/contracts/platform'
import { EDITOR_ONLY_STATE_KEYS, readDisabledEntryKeys } from '../model/draftPort'
import { duplicatePatchInArray, movePatchWithin } from '../model/patchOrder'
import { mapPatchDraftToContentFields } from '../model/mapPatchDraft'
import type { CpMakerDraftRecord, CpMakerDraftSummary, CpMakerExportResult } from '../model/cpMakerPort'

// ─── Adapter: backend record ↔ frontend draft ─────────────────────────

function parseConfigSchema(configSchemaDraft: Record<string, unknown>): ConfigSchemaEntry[] {
  return Object.entries(configSchemaDraft)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, definition]) => {
      const def =
        typeof definition === 'object' && definition !== null && !Array.isArray(definition) ? (definition as Record<string, unknown>) : {}
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

function stringDraftField(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return fallback
}

/** Sanitize an untrusted manifest dependency list from a persisted record. */
function parseDependencies(value: unknown): CpMakerDependency[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .map((entry) => ({
      uniqueId: stringDraftField(entry['uniqueId']).trim(),
      minimumVersion:
        typeof entry['minimumVersion'] === 'string' && entry['minimumVersion'].trim() !== '' ? entry['minimumVersion'].trim() : undefined,
      isRequired: entry['isRequired'] !== false,
    }))
    .filter((entry) => entry.uniqueId !== '')
}

function parseChangeRegistry(serialized: Record<string, unknown>): DraftPatch[] {
  const patches = Array.isArray(serialized['patches']) ? serialized['patches'] : []
  const parsed = patches
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p))
    .map((p) => {
      const rawTargetField = p['targetField']
      return {
        id: stringDraftField(p['id']),
        workspace: stringDraftField(p['workspace'], 'map') as WorkspaceId,
        target: stringDraftField(p['target']),
        action: stringDraftField(p['action'], 'EditData') as DraftPatch['action'],
        logName: stringDraftField(p['logName']),
        enabled: typeof p['enabled'] === 'boolean' ? p['enabled'] : typeof p['enabled'] === 'string' ? p['enabled'] : true,
        updatedAt: typeof p['updatedAt'] === 'number' ? p['updatedAt'] : undefined,
        when:
          typeof p['when'] === 'object' && p['when'] !== null && !Array.isArray(p['when'])
            ? (p['when'] as Record<string, unknown>)
            : undefined,
        fromFile: typeof p['fromFile'] === 'string' ? p['fromFile'] : undefined,
        editorState: p['editorState'] ?? {},
        targetLocale: typeof p['targetLocale'] === 'string' ? p['targetLocale'] : undefined,
        update: typeof p['update'] === 'string' ? p['update'] : undefined,
        priority: typeof p['priority'] === 'string' || typeof p['priority'] === 'number' ? p['priority'] : undefined,
        localTokens:
          typeof p['localTokens'] === 'object' && p['localTokens'] !== null && !Array.isArray(p['localTokens'])
            ? (p['localTokens'] as Record<string, unknown>)
            : undefined,
        targetField: Array.isArray(rawTargetField) ? rawTargetField.filter((v): v is string => typeof v === 'string') : undefined,
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
    lastDraftSavedAt: record.lastDraftSavedAt,
    lastExportedAt: record.lastExportedAt,
    lastExportPath: record.lastExportPath,
    lastExportFingerprint: record.lastExportFingerprint,
    projectMetadata: {
      projectName: record.projectMetadata.projectName,
      projectDescription: record.projectMetadata.projectDescription,
      projectAuthor: record.projectMetadata.projectAuthor,
      projectVersion: record.projectMetadata.projectVersion,
      projectUniqueId: record.projectMetadata.projectUniqueId,
      gameRootPath: record.projectMetadata.gameRootPath,
      contentPackForUniqueId: record.projectMetadata.contentPackForUniqueId,
      contentPackForMinimumVersion: record.projectMetadata.contentPackForMinimumVersion ?? undefined,
      minimumApiVersion: record.projectMetadata.minimumApiVersion ?? undefined,
      updateKeys: record.projectMetadata.updateKeys ?? undefined,
      dependencies: parseDependencies(record.projectMetadata.dependencies),
    } as CpMakerDraft['projectMetadata'],
    configSchema: parseConfigSchema((record.configSchemaDraft as Record<string, unknown>) ?? {}),
    patches: parseChangeRegistry((record.serializedChangeRegistry as Record<string, unknown>) ?? {}),
    virtualAssets: [],
    projectAssets: record.projectAssets ?? [],
    dynamicTokens: (record.dynamicTokens as Array<{ name: string; value: string; when?: Record<string, unknown> }> | undefined) ?? [],
    customLocations:
      (record.customLocations as Array<{ name: string; fromMapFile: string; migrateLegacyNames?: string[] }> | undefined) ?? [],
    aliasTokenNames: (record.aliasTokenNames as Record<string, string> | undefined) ?? {},
    eventSourceSnapshotsByTarget:
      (record.eventSourceSnapshotsByTarget as Record<string, { rawScriptsByKey: Record<string, string> }> | undefined) ?? {},
    i18nFiles: record.i18nFiles ?? [],
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
      ...(draft.projectMetadata.contentPackForMinimumVersion
        ? { contentPackForMinimumVersion: draft.projectMetadata.contentPackForMinimumVersion }
        : {}),
      ...(draft.projectMetadata.minimumApiVersion ? { minimumApiVersion: draft.projectMetadata.minimumApiVersion } : {}),
      ...(draft.projectMetadata.updateKeys && draft.projectMetadata.updateKeys.length > 0
        ? { updateKeys: draft.projectMetadata.updateKeys }
        : {}),
      ...(draft.projectMetadata.dependencies && draft.projectMetadata.dependencies.length > 0
        ? {
            dependencies: draft.projectMetadata.dependencies.map((dependency) => ({
              uniqueId: dependency.uniqueId,
              ...(dependency.minimumVersion ? { minimumVersion: dependency.minimumVersion } : {}),
              isRequired: dependency.isRequired,
            })),
          }
        : {}),
    },
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
    i18nFiles: draft.i18nFiles,
    projectAssets: draft.projectAssets,
    lastDraftSavedAt: draft.lastDraftSavedAt ?? null,
    lastExportedAt: draft.lastExportedAt ?? null,
    lastExportPath: draft.lastExportPath ?? null,
    lastExportFingerprint: draft.lastExportFingerprint ?? null,
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
  const contentPackFor: Record<string, unknown> = { UniqueID: meta.contentPackForUniqueId }
  if (meta.contentPackForMinimumVersion) {
    contentPackFor['MinimumVersion'] = meta.contentPackForMinimumVersion
  }
  const manifest: Record<string, unknown> = {
    Name: meta.projectName,
    Author: meta.projectAuthor,
    Version: meta.projectVersion,
    Description: meta.projectDescription,
    UniqueID: meta.projectUniqueId,
    ContentPackFor: contentPackFor,
  }
  if (meta.minimumApiVersion) {
    manifest['MinimumApiVersion'] = meta.minimumApiVersion
  }
  if (meta.updateKeys && meta.updateKeys.length > 0) {
    manifest['UpdateKeys'] = meta.updateKeys
  }
  if (meta.dependencies && meta.dependencies.length > 0) {
    manifest['Dependencies'] = meta.dependencies.map((dependency) => {
      const entry: Record<string, unknown> = { UniqueID: dependency.uniqueId, IsRequired: dependency.isRequired }
      if (dependency.minimumVersion) {
        entry['MinimumVersion'] = dependency.minimumVersion
      }
      return entry
    })
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
      // An entry the author switched off is parked in `disabledEntries`; drop it
      // from the merge as well, so a draft that carries the key in both records
      // (an import, or a patch written before the port owned the split) still
      // exports the author's intent rather than the stale enabled copy.
      for (const disabledKey of readDisabledEntryKeys(patch.editorState)) {
        delete entries[disabledKey]
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
      change['TextOperations'] = textOperations.map((op) => mapKeysToPascalCase(op as Record<string, unknown>, TEXT_OP_KEY_MAP))
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
      change['MoveEntries'] = moveEntries.map((entry) => mapKeysToPascalCase(entry as Record<string, unknown>, MOVE_ENTRY_KEY_MAP))
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
    if (patch.action === 'EditMap') {
      const contentFields = mapPatchDraftToContentFields(state, patch.fromFile)
      Object.assign(change, contentFields)
      // While the change-card model is active (changes non-empty), the file
      // card is the only exit for FromFile. Drop the generic patch-level value
      // when no file card exists, so a stale path cannot produce a region-less
      // FromFile that copies the whole source map over the target.
      const cardModelActive = Array.isArray(state?.['changes']) && (state['changes'] as unknown[]).length > 0
      if (cardModelActive && contentFields['FromFile'] === undefined) {
        delete change['FromFile']
      }
    }
    if (state && patch.action !== 'EditMap') {
      for (const [k, v] of Object.entries(state)) {
        // Everything else in `editorState` is forwarded verbatim, so the
        // editor-only records have to be named here or they land in the pack as
        // fields Content Patcher does not understand.
        if (k === 'entries' || EDITOR_ONLY_STATE_KEYS.includes(k)) continue
        // Map internal field names to CP field names.
        if ((k === 'fromArea' || k === 'toArea') && v && typeof v === 'object') {
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
          const pascalCase = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)
          const mappedArea: Record<string, number | string> = {}
          for (const [areaKey, areaVal] of Object.entries(area)) {
            mappedArea[pascalCase(areaKey)] = mapAreaValue(areaVal)
          }
          change[k === 'fromArea' ? 'FromArea' : 'ToArea'] = mappedArea
        } else if (k === 'patchMode') {
          change['PatchMode'] = v
        } else if (k === 'textOperations' && Array.isArray(v)) {
          change['TextOperations'] = v.map((op) => mapKeysToPascalCase(op as Record<string, unknown>, TEXT_OP_KEY_MAP))
        } else if (k === 'moveEntries' && Array.isArray(v)) {
          change['MoveEntries'] = v.map((entry) => mapKeysToPascalCase(entry as Record<string, unknown>, MOVE_ENTRY_KEY_MAP))
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
      const hasContent =
        change['MapProperties'] ||
        change['AddWarps'] ||
        change['AddNpcWarps'] ||
        change['MapTiles'] ||
        change['TextOperations'] ||
        change['FromFile']
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
  return (
    !patch.when &&
    !patch.targetLocale &&
    !patch.update &&
    !patch.priority &&
    !patch.localTokens &&
    (!patch.targetField || patch.targetField.length === 0)
  )
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
  const activeDraftKeyRef = useRef<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftsReady, setDraftsReady] = useState(false)
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
      setDraftsReady(true)
      return list
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
      setDraftsReady(true)
      return []
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
          setDraftsReady(true)
        }
      } catch (error) {
        if (!cancelled) {
          setDraftError(error instanceof Error ? error.message : String(error))
          setDraftsReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [port])

  // 加载指定草稿
  const loadDraft = useCallback(
    async (storageKey: string): Promise<boolean> => {
      setDraftLoading(true)
      setDraftError(null)
      try {
        const record = await port.loadDraft(storageKey)
        const draft = backendToFrontend(record)
        activeDraftKeyRef.current = draft.draftStorageKey
        setActiveDraft(draft)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
        return true
      } catch (error) {
        setDraftError(error instanceof Error ? error.message : String(error))
        activeDraftKeyRef.current = null
        setActiveDraft(null)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
        return false
      } finally {
        setDraftLoading(false)
      }
    },
    [port],
  )

  // 创建新草稿
  const createDraft = useCallback(
    async (metadata: Partial<CpMakerDraft['projectMetadata']>): Promise<boolean> => {
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
            projectUniqueId:
              metadata.projectUniqueId ??
              `${metadata.projectAuthor?.trim() || 'Author'}.${(metadata.projectName ?? 'UntitledMod').replace(/\s+/g, '')}`,
            gameRootPath: metadata.gameRootPath ?? null,
            contentPackForUniqueId: metadata.contentPackForUniqueId ?? 'Pathoschild.ContentPatcher',
            ...(metadata.contentPackForMinimumVersion ? { contentPackForMinimumVersion: metadata.contentPackForMinimumVersion } : {}),
            ...(metadata.minimumApiVersion ? { minimumApiVersion: metadata.minimumApiVersion } : {}),
            ...(metadata.updateKeys && metadata.updateKeys.length > 0 ? { updateKeys: metadata.updateKeys } : {}),
            ...(metadata.dependencies && metadata.dependencies.length > 0 ? { dependencies: metadata.dependencies } : {}),
          },
          configSchema: [],
          patches: [],
          virtualAssets: [],
          projectAssets: [],
          dynamicTokens: [],
          customLocations: [],
          aliasTokenNames: {},
          eventSourceSnapshotsByTarget: {},
          i18nFiles: [],
        }
        const record = frontendToBackend(newDraft)
        await port.saveDraft(record)
        activeDraftKeyRef.current = newDraft.draftStorageKey
        setActiveDraft(newDraft)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
        await refreshDrafts()
        return true
      } catch (error) {
        setDraftError(error instanceof Error ? error.message : String(error))
        return false
      } finally {
        setDraftLoading(false)
      }
    },
    [port, refreshDrafts],
  )

  // 保存草稿
  const saveDraft = useCallback(async () => {
    if (!activeDraft) return false
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = frontendToBackend({ ...activeDraft, lastDraftSavedAt: Date.now() })
      await port.saveDraft(record)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      await refreshDrafts()
      return true
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setDraftLoading(false)
    }
  }, [activeDraft, port, refreshDrafts])

  // 放弃未保存修改：回滚到最近持久化的记录
  const discardDraftChanges = useCallback(async () => {
    const storageKey = activeDraftKeyRef.current
    if (!storageKey) {
      setIsDirty(false)
      setDirtyPatchIds(new Set())
      return
    }
    setDraftLoading(true)
    setDraftError(null)
    try {
      const record = await port.loadDraft(storageKey)
      const draft = backendToFrontend(record)
      setActiveDraft(draft)
      setIsDirty(false)
      setDirtyPatchIds(new Set())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDraftError(message)
      throw error instanceof Error ? error : new Error(message)
    } finally {
      setDraftLoading(false)
    }
  }, [port])

  // 删除草稿
  const deleteDraft = useCallback(
    async (storageKey: string) => {
      try {
        await port.deleteDraft(storageKey)
        if (activeDraft?.draftStorageKey === storageKey) {
          activeDraftKeyRef.current = null
          setActiveDraft(null)
          setIsDirty(false)
          setDirtyPatchIds(new Set())
        }
        await refreshDrafts()
      } catch (error) {
        setDraftError(error instanceof Error ? error.message : String(error))
      }
    },
    [activeDraft, port, refreshDrafts],
  )

  /** Clear the in-memory active draft without deleting stored drafts. */
  const clearActiveDraft = useCallback(() => {
    activeDraftKeyRef.current = null
    setActiveDraft(null)
    setIsDirty(false)
    setDirtyPatchIds(new Set())
    setDraftError(null)
  }, [])

  // 复制草稿
  const copyDraft = useCallback(
    async (storageKey: string) => {
      setDraftLoading(true)
      try {
        const record = await port.copyDraft(storageKey)
        const copied = backendToFrontend(record)
        activeDraftKeyRef.current = copied.draftStorageKey
        setActiveDraft(copied)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
        await refreshDrafts()
      } catch (error) {
        setDraftError(error instanceof Error ? error.message : String(error))
      } finally {
        setDraftLoading(false)
      }
    },
    [port, refreshDrafts],
  )

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
        patches: current.patches.map((p) => (p.id === patchId ? { ...p, ...patch, updatedAt } : p)),
      }
    })
    setIsDirty(true)
    setDirtyPatchIds((current) => new Set(current).add(patchId))
  }, [])

  /** Moves one patch one position in the draft's export order; a boundary move is a no-op. */
  const reorderPatch = useCallback(
    (patchId: string, delta: -1 | 1) => {
      if (!activeDraft) return
      const nextPatches = movePatchWithin(activeDraft.patches, patchId, delta)
      if (nextPatches === activeDraft.patches) return
      setActiveDraft((current) => (current ? { ...current, patches: nextPatches } : current))
      setIsDirty(true)
      setDirtyPatchIds((current) => new Set(current).add(patchId))
    },
    [activeDraft],
  )

  /** Deep-copies a patch right after the original with a fresh id, so the copy joins the export order. */
  const duplicatePatch = useCallback(
    (patchId: string) => {
      if (!activeDraft) return
      const id = generatePatchId()
      const nextPatches = duplicatePatchInArray(activeDraft.patches, patchId, id)
      if (nextPatches === activeDraft.patches) return
      setActiveDraft((current) => (current ? { ...current, patches: nextPatches } : current))
      setIsDirty(true)
      setDirtyPatchIds((current) => new Set(current).add(id))
    },
    [activeDraft],
  )

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
        configSchema: current.configSchema.map((e) => (e.key === key ? { ...e, ...patch } : e)),
      }
    })
    setIsDirty(true)
  }, [])

  /** Replaces the whole ConfigSchema at once, for editors that manage their own row list. */
  const setConfigSchema = useCallback((entries: ConfigSchemaEntry[]) => {
    setActiveDraft((current) => (current ? { ...current, configSchema: entries } : current))
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

  const setAliasTokenNames = useCallback((aliases: Record<string, string>) => {
    setActiveDraft((current) => (current ? { ...current, aliasTokenNames: aliases } : current))
    setIsDirty(true)
  }, [])

  const setI18nFiles = useCallback((files: Array<{ locale: string; rawJson: string }>) => {
    setActiveDraft((current) => (current ? { ...current, i18nFiles: files } : current))
    setIsDirty(true)
  }, [])

  /** Merges entries into one locale's i18n file, creating the file when missing; existing keys always win. */
  const upsertI18nEntries = useCallback((locale: string, entries: Record<string, string>) => {
    setActiveDraft((current) => {
      if (!current) return current
      const files = [...current.i18nFiles]
      const index = files.findIndex((file) => file.locale === locale)
      // No-op only when the file already exists and nothing new arrives;
      // otherwise an empty merge still bootstraps the file.
      if (index >= 0 && Object.keys(entries).length === 0) return current
      const existing: Record<string, string> = {}
      if (index >= 0) {
        try {
          const parsed = JSON.parse(files[index]!.rawJson) as unknown
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            Object.assign(existing, parsed)
          }
        } catch {
          // An unreadable file is rebuilt from the incoming entries.
        }
      }
      const merged = { ...entries, ...existing }
      const rawJson = `${JSON.stringify(merged, null, 2)}\n`
      if (index >= 0) {
        files[index] = { locale, rawJson }
      } else {
        files.push({ locale, rawJson })
      }
      return { ...current, i18nFiles: files }
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

  const readProjectAsset = useCallback(
    async (relativePath: string) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      return port.readProjectAsset({ draftStorageKey: activeDraft.draftStorageKey, relativePath })
    },
    [activeDraft, port],
  )

  const loadProjectMapAsset = useCallback(
    async (relativePath: string) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      return port.loadProjectMapAsset({ draftStorageKey: activeDraft.draftStorageKey, relativePath })
    },
    [activeDraft, port],
  )

  const writeProjectAsset = useCallback(
    async (
      asset: Pick<VirtualPreviewAsset, 'relativePath' | 'mediaType' | 'bytesBase64'>,
      sourceType: ProjectAssetRef['sourceType'] = 'edited',
    ) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      const saved = await port.writeProjectAsset({
        draftStorageKey: activeDraft.draftStorageKey,
        relativePath: asset.relativePath,
        mediaType: asset.mediaType,
        bytesBase64: asset.bytesBase64,
        sourceType,
      })
      setActiveDraft((current) =>
        current
          ? {
              ...current,
              projectAssets: [
                ...current.projectAssets.filter((entry) => entry.relativePath.toLowerCase() !== saved.relativePath.toLowerCase()),
                saved,
              ].sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
            }
          : current,
      )
      return saved
    },
    [activeDraft, port],
  )

  const writeProjectAssets = useCallback(
    async (
      assets: Array<Pick<VirtualPreviewAsset, 'relativePath' | 'mediaType' | 'bytesBase64'>>,
      sourceType: ProjectAssetRef['sourceType'] = 'edited',
    ) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      const saved = await port.writeProjectAssets({
        draftStorageKey: activeDraft.draftStorageKey,
        assets: assets.map((asset) => ({ ...asset, sourceType })),
      })
      const savedPaths = new Set(saved.map((asset) => asset.relativePath.toLowerCase()))
      setActiveDraft((current) =>
        current
          ? {
              ...current,
              projectAssets: [...current.projectAssets.filter((entry) => !savedPaths.has(entry.relativePath.toLowerCase())), ...saved].sort(
                (left, right) => left.relativePath.localeCompare(right.relativePath),
              ),
            }
          : current,
      )
      return saved
    },
    [activeDraft, port],
  )

  const applyPersistedAssetMutation = useCallback((record: CpMakerDraftRecord) => {
    const persisted = backendToFrontend(record)
    const persistedPatches = new Map(persisted.patches.map((patch) => [patch.id, patch]))
    setActiveDraft((current) =>
      current
        ? {
            ...current,
            projectAssets: persisted.projectAssets,
            customLocations: persisted.customLocations,
            patches: current.patches.map((patch) => {
              const saved = persistedPatches.get(patch.id)
              return saved ? { ...patch, fromFile: saved.fromFile } : patch
            }),
          }
        : current,
    )
    return persisted
  }, [])

  const importProjectAssets = useCallback(
    async (sourcePaths: string[], destinationDirectory = 'assets') => {
      if (!activeDraft) throw new Error('No active draft is available.')
      const saved = await port.importProjectAssets({
        draftStorageKey: activeDraft.draftStorageKey,
        sourcePaths,
        destinationDirectory,
      })
      return applyPersistedAssetMutation(saved)
    },
    [activeDraft, applyPersistedAssetMutation, port],
  )

  const renameProjectAsset = useCallback(
    async (relativePath: string, newRelativePath: string) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      const saved = await port.renameProjectAsset({ draftStorageKey: activeDraft.draftStorageKey, relativePath, newRelativePath })
      return applyPersistedAssetMutation(saved)
    },
    [activeDraft, applyPersistedAssetMutation, port],
  )

  const deleteProjectAsset = useCallback(
    async (relativePath: string) => {
      if (!activeDraft) throw new Error('No active draft is available.')
      const saved = await port.deleteProjectAsset({ draftStorageKey: activeDraft.draftStorageKey, relativePath })
      return applyPersistedAssetMutation(saved)
    },
    [activeDraft, applyPersistedAssetMutation, port],
  )

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

  const importPack = useCallback(
    async (modDirectoryPath: string) => {
      setDraftLoading(true)
      setDraftError(null)
      try {
        const importedRecord = await port.importPack(modDirectoryPath)
        const record = await port.saveDraft(importedRecord)
        const draft = backendToFrontend(record)
        activeDraftKeyRef.current = draft.draftStorageKey
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
    },
    [port, refreshDrafts],
  )

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
      const configAssets = activeDraft.configSchema.length > 0 ? [buildConfigJsonAsset(activeDraft.configSchema)] : []

      const result = await port.exportPack({
        draft_storage_key: activeDraft.draftStorageKey,
        output_path: outputPath,
        manifest_json: manifestJson,
        content_json: contentJson,
        virtual_assets: [...activeDraft.virtualAssets, ...includeAssets, ...configAssets],
        i18n_files: activeDraft.i18nFiles,
      })
      const exportedDraft: CpMakerDraft = {
        ...activeDraft,
        lastDraftSavedAt: Date.now(),
        lastExportedAt: Date.now(),
        lastExportPath: outputPath,
      }
      try {
        await port.saveDraft(frontendToBackend(exportedDraft))
        activeDraftKeyRef.current = exportedDraft.draftStorageKey
        setActiveDraft(exportedDraft)
        setIsDirty(false)
        setDirtyPatchIds(new Set())
        await refreshDrafts()
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        setDraftError(`Export succeeded, but export metadata could not be saved: ${detail}`)
        throw new Error(`Export succeeded, but export metadata could not be saved: ${detail}`)
      }
      return result
    },
    [activeDraft, port, refreshDrafts],
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
    draftsReady,
    activeDraft,
    getActiveDraftKey: useCallback(() => activeDraftKeyRef.current, []),
    draftLoading,
    draftError,
    isDirty,
    dirtyPatchIds,
    createDraft,
    loadDraft,
    saveDraft,
    /** Reverts the active draft to its last persisted record and clears dirty tracking; keeps in-memory edits and rethrows when the stored record cannot be reloaded. */
    discardDraftChanges,
    deleteDraft,
    clearActiveDraft,
    copyDraft,
    refreshDrafts,
    chooseDirectory: (title?: string) => port.chooseDirectory(title),
    chooseFiles: (title?: string, filters?: readonly DialogFilter[]) => port.chooseFiles(title, filters),

    // Patch 管理
    addPatch: addPatchWithReturn,
    removePatch,
    updatePatch,
    reorderPatch,
    duplicatePatch,
    getPatchesForWorkspace,

    // Config Schema
    configSchema: activeDraft?.configSchema ?? [],
    addConfigEntry,
    removeConfigEntry,
    updateConfigEntry,
    setConfigSchema,

    // Virtual Assets
    virtualAssets: activeDraft?.virtualAssets ?? [],
    addVirtualAsset,
    removeVirtualAsset,

    // Persisted project assets
    projectAssets: activeDraft?.projectAssets ?? [],
    readProjectAsset,
    loadProjectMapAsset,
    writeProjectAsset,
    writeProjectAssets,
    importProjectAssets,
    renameProjectAsset,
    deleteProjectAsset,

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
    setAliasTokenNames,

    // Project translations
    i18nFiles: activeDraft?.i18nFiles ?? [],
    setI18nFiles,
    upsertI18nEntries,

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

/** Public CP Maker state contract, including the synchronous active-draft identity used by lifecycle guards. */
export type UseCpMakerReturn = ReturnType<typeof useCpMaker>
