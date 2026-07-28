import { useEffect, useMemo, useReducer, useState } from 'react'
import { Music, Package, UserRound, Volume2, Waypoints, type LucideIcon } from 'lucide-react'
import type { LocaleCode } from '@locales'
import type { EventWorkflowCopy } from '@locales/api'
import { useEventStageCopy } from '@locales/provider'
import type { GameDirectoryInfo } from '@entities/game/api'
import { loadImageDataUrl, loadResourceRegistry } from '@entities/game/api'
import type { ResourceRegistry, ResourceRegistryEntry } from '@entities/game/api'
import { detectDefaultGameDirectoryFromDevBridge } from '@entities/game/api/devAssetBridge'
import {
  getItemKindLabel,
  loadItemTextureAssetState,
  loadItemWorkspaceEntries,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '@entities/item'
import { cx } from '@shared/lib/helper'
import { configureImageDataUrlLoader } from '@shared/lib/assets'
import { configureDesktopPlatformPorts } from '@platform/host'
import { createElectronPlatformPorts, isElectronHost } from '@platform/electron'
import { createTauriPlatformPorts } from '@platform/tauri'
import {
  EventResourcePicker,
  type EventResourceKind,
  type EventResourceOption,
} from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventResourcePicker'
import {
  buildDefaultEventResourceRegistry,
  type EventResourceRegistry,
} from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/eventResourceRegistry'

type DevResourceBrowserLabProps = {
  locale?: LocaleCode
  directoryInfo?: GameDirectoryInfo | null
}

if (import.meta.env.DEV) {
  configureDesktopPlatformPorts(isElectronHost() ? createElectronPlatformPorts() : createTauriPlatformPorts())
  configureImageDataUrlLoader(loadImageDataUrl)
}

async function loadDesktopResourceRegistry(rootPath: string, locale: LocaleCode) {
  return loadResourceRegistry(rootPath, locale)
}

type ResourceLoadState = 'fallback' | 'loading' | 'loaded' | 'partial'

type BrowserRegistryState = {
  registry: EventResourceRegistry | null
  loadState: ResourceLoadState
}

type BrowserRegistryAction =
  | { type: 'fallback' }
  | { type: 'loading' }
  | { type: 'loaded'; registry: EventResourceRegistry; loadState: 'loaded' | 'partial' }

function browserRegistryReducer(_state: BrowserRegistryState, action: BrowserRegistryAction): BrowserRegistryState {
  switch (action.type) {
    case 'fallback':
      return {
        registry: null,
        loadState: 'fallback',
      }
    case 'loading':
      return {
        registry: null,
        loadState: 'loading',
      }
    case 'loaded':
      return {
        registry: action.registry,
        loadState: action.loadState,
      }
  }
}

const RESOURCE_KINDS: Array<{
  kind: EventResourceKind
  icon: LucideIcon
  tone: string
}> = [
  {
    kind: 'actor',
    icon: UserRound,
    tone: '#22c55e',
  },
  {
    kind: 'item',
    icon: Package,
    tone: '#f97316',
  },
  {
    kind: 'location',
    icon: Waypoints,
    tone: '#14b8a6',
  },
  {
    kind: 'music',
    icon: Music,
    tone: '#ec4899',
  },
  {
    kind: 'sound',
    icon: Volume2,
    tone: '#8b5cf6',
  },
]

const DEFAULT_SELECTIONS: Record<EventResourceKind, string> = {
  actor: 'Abigail',
  item: '(O)24',
  location: 'Town',
  music: 'spring2',
  sound: 'coin',
}

function sourceLabelForEntry(entry: ResourceRegistryEntry, locale: LocaleCode) {
  if (entry.sourceKind === 'game') {
    return locale === 'zh-CN' ? '游戏资源' : 'Game assets'
  }
  return entry.source
}

function makeRegistryOption(entry: ResourceRegistryEntry, locale: LocaleCode): EventResourceOption | null {
  if (!['actor', 'item', 'location', 'music', 'sound'].includes(entry.kind)) {
    return null
  }
  const kind = entry.kind as EventResourceKind
  const source = sourceLabelForEntry(entry, locale)
  return {
    id: entry.id,
    value: entry.value,
    label: entry.label || entry.value,
    kind,
    subtitle: source,
    badge: source,
    category: entry.category ?? source,
    meta: entry.metadata?.qualifiedId ?? entry.metadata?.id ?? entry.value,
    sourcePath: entry.relativePath ?? undefined,
  }
}

function pushUniqueResource(registry: EventResourceRegistry, option: EventResourceOption) {
  const target = registry[option.kind]
  if (target.some((candidate) => candidate.value === option.value)) {
    return
  }
  target.push(option)
}

function buildRegistryFromDesktopRegistry(
  desktopRegistry: ResourceRegistry,
  locale: LocaleCode,
  sourceLabels: EventWorkflowCopy['resourceSources'],
): EventResourceRegistry {
  const registry = buildDefaultEventResourceRegistry(sourceLabels)

  for (const entry of desktopRegistry.entries) {
    const option = makeRegistryOption(entry, locale)
    if (!option) {
      continue
    }
    pushUniqueResource(registry, option)
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

function makeItemResourceOption(
  entry: ItemWorkspaceEntry,
  textureState: ItemTextureAssetState | null,
  locale: LocaleCode,
): EventResourceOption {
  const source = locale === 'zh-CN' ? '物品目录' : 'Item catalog'
  return {
    id: `item:${entry.qualifiedItemId}`,
    value: entry.qualifiedItemId,
    label: entry.displayName,
    kind: 'item',
    subtitle: entry.internalName,
    badge: source,
    category: getItemPrimaryCategory(entry),
    meta: buildItemMeta(entry),
    sourcePath: entry.texturePathLabel,
    item: entry,
    itemTexture: textureState,
  }
}

async function loadItemResourceOptions(rootPath: string, locale: LocaleCode) {
  const itemEntries = await loadItemWorkspaceEntries(rootPath, locale)
  const textureAssetNames = Array.from(
    new Set(itemEntries.map((entry) => entry.textureAssetName).filter((assetName): assetName is string => Boolean(assetName))),
  )
  const textureEntries = await Promise.all(
    textureAssetNames.map(async (assetName) => [assetName, await loadItemTextureAssetState(rootPath, assetName, locale)] as const),
  )
  const textureStatesByAssetName = Object.fromEntries(textureEntries)

  return itemEntries.map((entry) =>
    makeItemResourceOption(entry, entry.textureAssetName ? (textureStatesByAssetName[entry.textureAssetName] ?? null) : null, locale),
  )
}

function countDesktopRegistryResources(desktopRegistry: ResourceRegistry) {
  return desktopRegistry.entries.filter((entry) => ['actor', 'item', 'location', 'music', 'sound'].includes(entry.kind)).length
}

export function DevResourceBrowserLab({ locale = 'zh-CN', directoryInfo = null }: DevResourceBrowserLabProps) {
  const copy = useEventStageCopy().devResourceBrowserLab
  const sourceLabels = useEventStageCopy().workflow.resourceSources
  const [detectedDevRootPath, setDetectedDevRootPath] = useState<string | null>(null)
  const [{ registry: collectedRegistry }, dispatchBrowserRegistry] = useReducer(browserRegistryReducer, {
    registry: null,
    loadState: 'fallback',
  })
  const registry = useMemo(() => collectedRegistry ?? buildDefaultEventResourceRegistry(sourceLabels), [collectedRegistry, sourceLabels])
  const [selections, setSelections] = useState<Record<EventResourceKind, string>>(DEFAULT_SELECTIONS)
  const effectiveRootPath = directoryInfo?.rootPath ?? detectedDevRootPath

  useEffect(() => {
    if (directoryInfo?.rootPath || detectedDevRootPath || !import.meta.env.DEV) {
      return
    }

    let cancelled = false
    void detectDefaultGameDirectoryFromDevBridge()
      .then((detectedPath) => {
        if (!cancelled && detectedPath) {
          setDetectedDevRootPath(detectedPath)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [detectedDevRootPath, directoryInfo?.rootPath])

  useEffect(() => {
    const rootPath = effectiveRootPath
    if (!rootPath) {
      dispatchBrowserRegistry({ type: 'fallback' })
      return
    }

    let cancelled = false
    const gameRootPath = rootPath
    dispatchBrowserRegistry({ type: 'loading' })

    async function collectResources() {
      const [desktopRegistry, itemOptionsResult] = await Promise.all([
        loadDesktopResourceRegistry(gameRootPath, locale),
        loadItemResourceOptions(gameRootPath, locale).then(
          (options) => ({ options, error: null }),
          (error: unknown) => ({ options: [] as EventResourceOption[], error }),
        ),
      ])

      if (cancelled) {
        return
      }

      const backendResourceCount = countDesktopRegistryResources(desktopRegistry)
      const nextRegistry = buildRegistryFromDesktopRegistry(desktopRegistry, locale, sourceLabels)
      if (itemOptionsResult.options.length > 0) {
        nextRegistry.item = itemOptionsResult.options
      }

      const nextResourceCount = backendResourceCount + itemOptionsResult.options.length
      if (nextResourceCount === 0) {
        dispatchBrowserRegistry({ type: 'fallback' })
        return
      }

      const hasWarnings = desktopRegistry.warnings.length > 0 || itemOptionsResult.error != null
      dispatchBrowserRegistry({
        type: 'loaded',
        registry: nextRegistry,
        loadState: hasWarnings ? 'partial' : 'loaded',
      })
    }

    void collectResources().catch(() => {
      if (cancelled) {
        return
      }
      dispatchBrowserRegistry({ type: 'fallback' })
    })

    return () => {
      cancelled = true
    }
  }, [effectiveRootPath, locale, sourceLabels])

  return (
    <main className="dev-resource-browser">
      <div className="dev-resource-browser__workspace">
        <section className="dev-resource-browser__main" aria-label={copy.introTitle}>
          <div className="dev-resource-browser__main-body">
            <div className="dev-resource-browser__intro">
              <p className="dev-resource-browser__intro-title">{copy.introTitle}</p>
              <p className="dev-resource-browser__intro-desc">{copy.introDesc}</p>
            </div>

            <div className="dev-resource-browser__kind-grid">
              {RESOURCE_KINDS.map((resource) => {
                const Icon = resource.icon
                const selected = registry[resource.kind].find((option) => option.value === selections[resource.kind])
                const kindCopy = copy.kinds[resource.kind]

                return (
                  <article key={resource.kind} className="dev-resource-browser__kind-card">
                    <div className="dev-resource-browser__kind-head">
                      <span className="dev-resource-browser__kind-icon" style={{ color: resource.tone }} aria-hidden="true">
                        <Icon className="h-[1.125rem] w-[1.125rem]" />
                      </span>
                      <span className="dev-resource-browser__kind-count">{registry[resource.kind].length}</span>
                    </div>
                    <div>
                      <h2 className="dev-resource-browser__kind-title">{kindCopy.title}</h2>
                      <p className="dev-resource-browser__kind-desc">{kindCopy.description}</p>
                    </div>
                    <div className={cx('dev-resource-browser__selection-box', selected && 'has-value')}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{selected?.label ?? selections[resource.kind]}</span>
                    </div>
                    <EventResourcePicker
                      value={selections[resource.kind]}
                      label={kindCopy.title}
                      placeholder={kindCopy.placeholder}
                      options={registry[resource.kind]}
                      selectionMode="confirm"
                      onSelect={(value) => {
                        setSelections((current) => ({
                          ...current,
                          [resource.kind]: value,
                        }))
                      }}
                      triggerClassName="dev-resource-browser__picker-trigger"
                    />
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export default DevResourceBrowserLab
