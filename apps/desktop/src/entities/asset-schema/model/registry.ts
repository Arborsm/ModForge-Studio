/**
 * @file Static registries for asset schemas and enum catalogs.
 * @module entities/asset-schema
 *
 * `getAssetSchema` is the exact lookup that replaced the editor-selection
 * heuristics: a patch target either has a schema (structured editor) or it does
 * not (raw escape hatch). Registration happens once during workbench assembly,
 * never at render time.
 */

import type { AssetSchema } from './fieldSchema'

const schemaRegistry = new Map<string, AssetSchema>()
const enumCatalogs = new Map<string, readonly string[]>()

function normalizeAssetId(assetId: string): string {
  return assetId.trim().replaceAll('\\', '/').toLowerCase()
}

/** Registers the field schema of one Content Patcher asset target. */
export function registerAssetSchema(schema: AssetSchema) {
  schemaRegistry.set(normalizeAssetId(schema.assetId), schema)
}

/**
 * Returns the schema of an asset target, or undefined when the asset has no
 * structured editor yet. Matching ignores case and slash direction, mirroring
 * how Content Patcher resolves targets. Schemas registered with a `/*`-suffixed
 * wildcard id (used by compat plugin assetSchema contributions, e.g.
 * `spacechase0.SpaceCore/*`) match any target under that prefix; exact matches
 * always win over wildcard matches.
 */
export function getAssetSchema(assetId: string): AssetSchema | undefined {
  const normalized = normalizeAssetId(assetId)
  const exact = schemaRegistry.get(normalized)
  if (exact) {
    return exact
  }
  for (const [registeredId, schema] of schemaRegistry) {
    if (registeredId.endsWith('/*') && normalized.startsWith(registeredId.slice(0, -1))) {
      return schema
    }
  }
  return undefined
}

/** Lists registered asset ids in registration order. */
export function listAssetSchemaIds(): string[] {
  return Array.from(schemaRegistry.values(), (schema) => schema.assetId)
}

/** Registers a static enum catalog referenced by `AssetFieldSchema.enumCatalog`. */
export function registerEnumCatalog(catalogId: string, values: readonly string[]) {
  enumCatalogs.set(catalogId, values)
}

/** Returns the values of a static enum catalog, or an empty list when unregistered. */
export function getEnumCatalog(catalogId: string | undefined): readonly string[] {
  return catalogId === undefined ? [] : (enumCatalogs.get(catalogId) ?? [])
}
