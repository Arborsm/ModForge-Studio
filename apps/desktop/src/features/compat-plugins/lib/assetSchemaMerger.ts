/**
 * @file Converts plugin `AssetSchemaContribution` entries into the shared
 * `AssetSchema` shape so the CP editor renderer can consume them through the
 * same `registerAssetSchema` path as the built-in schemas.
 * @module features/compat-plugins
 */
import {
  registerAssetSchema,
  unregisterAssetSchema,
  type AssetFieldSchema,
  type AssetSchema,
  type AssetGroupSchema,
  type FieldControl,
} from '@entities/asset-schema'
import type { AssetSchemaContribution, AssetSchemaField } from '../api/types'

/**
 * Maps a plugin field `type` string to the shared renderer's `FieldControl`.
 *
 * Plugin types are an open string (the wire format keeps them forward-compatible),
 * so unknown types fall back to `raw` — the editor preserves the value verbatim
 * instead of guessing a widget.
 */
function mapControl(pluginType: string): FieldControl {
  switch (pluginType) {
    case 'text':
      return 'text'
    case 'number':
      return 'number'
    case 'choice':
      return 'enum'
    case 'bool':
      return 'toggle'
    case 'string-list':
      return 'string_list'
    case 'record-list':
      return 'nested_list'
    case 'object':
      return 'nested_object'
    default:
      return 'raw'
  }
}

/**
 * Converts one plugin field declaration into the shared `AssetFieldSchema`.
 *
 * `path` becomes the JSON key the renderer reads and writes. `labelKey` is cast
 * to the closed `AssetFieldLabelKey` union: the renderer falls back to
 * `field.key` when the typed locale record has no entry for the key, so a
 * plugin-contributed key that is absent from the built-in bundle still renders
 * a sensible title.
 */
function convertField(field: AssetSchemaField, groupId: string): AssetFieldSchema {
  return {
    key: field.path,
    group: groupId,
    control: mapControl(field.type),
    labelKey: (field.labelKey ?? field.path) as AssetFieldSchema['labelKey'],
  }
}

/**
 * Converts a plugin `AssetSchemaContribution` into a registered `AssetSchema`.
 *
 * Plugin contributions do not declare collapsible groups, so every field lands
 * in a single default group. Field declaration order drives `keyOrder`, which
 * the serializer honours when writing the patch back out.
 */
export function mergePluginAssetSchema(contribution: AssetSchemaContribution): AssetSchema {
  const groupId = 'plugin-fields'
  const group: AssetGroupSchema = {
    id: groupId,
    labelKey: groupId as AssetGroupSchema['labelKey'],
  }
  const fields = contribution.fields.map((field) => convertField(field, groupId))
  return {
    assetId: contribution.assetPath,
    keyOrder: fields.map((field) => field.key),
    groups: [group],
    fields,
  }
}

/**
 * Converts every `AssetSchemaContribution` across a set of plugins into
 * `AssetSchema` entries ready for `registerAssetSchema`.
 */
export function mergePluginAssetSchemas(plugins: ReadonlyArray<{ assetSchemas: readonly AssetSchemaContribution[] }>): AssetSchema[] {
  const schemas: AssetSchema[] = []
  for (const plugin of plugins) {
    for (const contribution of plugin.assetSchemas) {
      schemas.push(mergePluginAssetSchema(contribution))
    }
  }
  return schemas
}

/**
 * Asset ids currently registered as plugin-contributed. Tracked so hot-reload
 * can unregister schemas from deleted plugins before re-registering the new
 * set, keeping the entity registry in sync with the live plugin tree.
 */
const registeredPluginSchemaIds = new Set<string>()

/**
 * Replaces all plugin-contributed asset schemas in the entity registry with the
 * schemas derived from the given plugin set. Schemas from plugins that are no
 * longer present are unregistered; updated schemas overwrite in place.
 */
export function registerPluginAssetSchemas(plugins: ReadonlyArray<{ assetSchemas: readonly AssetSchemaContribution[] }>): void {
  for (const id of registeredPluginSchemaIds) {
    unregisterAssetSchema(id)
  }
  registeredPluginSchemaIds.clear()
  for (const schema of mergePluginAssetSchemas(plugins)) {
    registerAssetSchema(schema)
    registeredPluginSchemaIds.add(schema.assetId)
  }
}
