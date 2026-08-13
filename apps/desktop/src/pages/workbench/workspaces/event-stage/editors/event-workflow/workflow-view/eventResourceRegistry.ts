import { parseEventCommand, parseEventCommands, parseEventSceneSetup } from '@entities/event'
import type { ResourceRegistry } from '@entities/game/api'
import { getItemKindLabel, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import type { DraftPatch } from '@features/cp-maker'
import type { ResourceBrowserOption } from '@features/resource-browser'

import type { EventWorkflowCopy } from '@locales/api'

export type EventActorAssetPreview = {
  spriteUrl: string | null
  portraitUrl: string | null
}

export type EventResourceKind = 'actor' | 'item' | 'location' | 'music' | 'sound'
export type EventResourceOption = ResourceBrowserOption & { kind: EventResourceKind }
export type EventResourceRegistry = Record<EventResourceKind, EventResourceOption[]>

type BuildEventResourceRegistryOptions = {
  patch: DraftPatch
  draftPatches: DraftPatch[]
  entries: Record<string, unknown>
  eventLocations?: Record<string, string>
  actorAssets?: Record<string, EventActorAssetPreview>
  globalRegistry?: ResourceRegistry | null
  itemCatalog?: ItemWorkspaceEntry[]
  itemTexturesByAssetName?: Record<string, ItemTextureAssetState>
  sourceLabels: EventWorkflowCopy['resourceSources']
}

const EMPTY_ENTRIES: Record<string, unknown> = {}

const RESOURCE_TONES = ['#0ea5e9', '#f97316', '#22c55e', '#ec4899', '#8b5cf6', '#14b8a6', '#eab308', '#64748b']

function resourceTone(seed: string) {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % RESOURCE_TONES.length
  }
  return RESOURCE_TONES[hash] ?? RESOURCE_TONES[0]
}

function makeOption(kind: EventResourceKind, value: string, label: string, source: string, preview?: string | null): EventResourceOption {
  return {
    id: `${kind}:${source}:${value}`,
    value,
    label,
    kind,
    subtitle: source,
    badge: source,
    preview: preview ?? undefined,
    tone: resourceTone(value),
  }
}

function pushUnique(target: EventResourceOption[], option: EventResourceOption) {
  const existingIndex = target.findIndex((candidate) => candidate.value === option.value)
  if (existingIndex === -1) {
    target.push(option)
    return
  }

  const existing = target[existingIndex]
  target[existingIndex] = {
    ...existing,
    preview: existing.preview ?? option.preview,
    subtitle: existing.subtitle === option.subtitle ? existing.subtitle : `${existing.subtitle}, ${option.subtitle}`,
    badge: existing.badge ?? option.badge,
  }
}

function sourceLabelForEntry(source: string, sourceKind: string, labels: EventWorkflowCopy['resourceSources']) {
  if (sourceKind === 'game') {
    return labels.gameAssets
  }
  return source
}

export function buildEventResourceRegistryFromGlobal(
  globalRegistry: ResourceRegistry | null | undefined,
  sourceLabels: EventWorkflowCopy['resourceSources'],
): EventResourceRegistry {
  const registry = buildDefaultEventResourceRegistry(sourceLabels)

  for (const entry of globalRegistry?.entries ?? []) {
    if (!['actor', 'item', 'location', 'music', 'sound'].includes(entry.kind)) {
      continue
    }

    const kind = entry.kind as EventResourceKind
    const source = sourceLabelForEntry(entry.source, entry.sourceKind, sourceLabels)
    pushUnique(registry[kind], {
      ...makeOption(kind, entry.value, entry.label || entry.value, source, entry.absolutePath ?? entry.relativePath ?? null),
      category: entry.category ?? source,
      meta: entry.metadata?.qualifiedId ?? entry.metadata?.id ?? entry.value,
      sourcePath: entry.relativePath ?? undefined,
    })
  }

  return registry
}

function getItemPrimaryCategory(entry: ItemWorkspaceEntry) {
  return entry.browseCategories.find((category) => category !== 'all') ?? entry.kind
}

function buildItemMeta(entry: ItemWorkspaceEntry) {
  return [
    entry.qualifiedItemId,
    entry.kindMetaLabel ?? getItemKindLabel(entry.kind),
    entry.price != null ? `${entry.price}g` : null,
    entry.cropData ? 'crop' : null,
    entry.fishData ? 'fish' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function makeItemCatalogOption(
  entry: ItemWorkspaceEntry,
  textureState: ItemTextureAssetState | null,
  sourceLabels: EventWorkflowCopy['resourceSources'],
): EventResourceOption {
  return {
    id: `item:${entry.qualifiedItemId}`,
    value: entry.qualifiedItemId,
    label: entry.displayName,
    kind: 'item',
    subtitle: entry.internalName,
    badge: sourceLabels.itemCatalog,
    category: getItemPrimaryCategory(entry),
    meta: buildItemMeta(entry),
    sourcePath: entry.texturePathLabel,
    item: entry,
    itemTexture: entry.textureAssetName ? (textureState ?? null) : null,
  }
}

function applyItemCatalog(
  registry: EventResourceRegistry,
  itemCatalog: ItemWorkspaceEntry[] | null | undefined,
  itemTexturesByAssetName: Record<string, ItemTextureAssetState> | null | undefined,
  sourceLabels: EventWorkflowCopy['resourceSources'],
) {
  if (!itemCatalog?.length) {
    return
  }

  registry.item = itemCatalog.map((entry) =>
    makeItemCatalogOption(entry, entry.textureAssetName ? (itemTexturesByAssetName?.[entry.textureAssetName] ?? null) : null, sourceLabels),
  )
}

function collectTargetLocation(target: unknown) {
  if (typeof target !== 'string') {
    return null
  }
  const match = /^Data\/Events\/(.+)$/u.exec(target)
  return match?.[1] ?? null
}

function collectEntriesFromPatch(patch: DraftPatch) {
  const editorState = patch.editorState as { entries?: Record<string, unknown> } | undefined
  const editorEntries = editorState?.entries
  if (editorEntries && typeof editorEntries === 'object') {
    return editorEntries
  }
  return EMPTY_ENTRIES
}

function collectResourcesFromRawScript(
  rawScript: string,
  registry: EventResourceRegistry,
  source: string,
  actorAssets?: Record<string, EventActorAssetPreview>,
) {
  const segments = parseEventCommands(rawScript)
  const scene = parseEventSceneSetup(segments)

  if (scene.musicCue) {
    pushUnique(registry.music, makeOption('music', scene.musicCue, scene.musicCue, source))
  }

  for (const actor of scene.actors) {
    const preview = actorAssets?.[actor.actorName]?.portraitUrl ?? actorAssets?.[actor.actorName]?.spriteUrl
    pushUnique(registry.actor, makeOption('actor', actor.actorName, actor.actorName, source, preview))
  }

  for (let index = 3; index < segments.length; index += 1) {
    const command = parseEventCommand(segments[index] ?? '', index - 3)
    switch (command.command) {
      case 'playMusic':
        if (command.args[1]) {
          pushUnique(registry.music, makeOption('music', command.args[1], command.args[1], source))
        }
        break
      case 'playSound':
        if (command.args[1]) {
          pushUnique(registry.sound, makeOption('sound', command.args[1], command.args[1], source))
        }
        break
      case 'changeLocation':
      case 'changeToTemporaryMap':
        if (command.args[1]) {
          pushUnique(registry.location, makeOption('location', command.args[1], command.args[1], source))
        }
        break
      default:
        break
    }

    for (const arg of command.args) {
      if (/^\([A-Z]\)\d+/u.test(arg)) {
        pushUnique(registry.item, makeOption('item', arg, arg, source))
      }
    }
  }
}

export function buildDefaultEventResourceRegistry(_sourceLabels: EventWorkflowCopy['resourceSources']): EventResourceRegistry {
  return {
    actor: [],
    item: [],
    location: [],
    music: [],
    sound: [],
  }
}

export function buildEventResourceRegistry({
  patch,
  draftPatches,
  entries,
  eventLocations,
  actorAssets,
  globalRegistry,
  itemCatalog,
  itemTexturesByAssetName,
  sourceLabels,
}: BuildEventResourceRegistryOptions): EventResourceRegistry {
  const registry = buildEventResourceRegistryFromGlobal(globalRegistry, sourceLabels)
  applyItemCatalog(registry, itemCatalog, itemTexturesByAssetName, sourceLabels)
  const draftSource = sourceLabels.project
  const patchSource = sourceLabels.patch

  for (const location of Object.values(eventLocations ?? {})) {
    if (location) {
      pushUnique(registry.location, makeOption('location', location, location, patchSource))
    }
  }

  const patchTargetLocation = collectTargetLocation(patch.target)
  if (patchTargetLocation) {
    pushUnique(registry.location, makeOption('location', patchTargetLocation, patchTargetLocation, patchSource))
  }

  for (const raw of Object.values(entries)) {
    if (typeof raw === 'string') {
      collectResourcesFromRawScript(raw, registry, patchSource, actorAssets)
    }
  }

  for (const draftPatch of draftPatches) {
    const targetLocation = collectTargetLocation(draftPatch.target)
    if (targetLocation) {
      pushUnique(registry.location, makeOption('location', targetLocation, targetLocation, draftSource))
    }
    for (const raw of Object.values(collectEntriesFromPatch(draftPatch))) {
      if (typeof raw === 'string') {
        collectResourcesFromRawScript(raw, registry, draftSource, actorAssets)
      }
    }
  }

  for (const [actorName, asset] of Object.entries(actorAssets ?? {})) {
    pushUnique(registry.actor, makeOption('actor', actorName, actorName, draftSource, asset.portraitUrl ?? asset.spriteUrl))
  }

  return registry
}
