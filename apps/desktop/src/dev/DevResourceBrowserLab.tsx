import { useEffect, useMemo, useReducer, useState } from 'react'
import { Database, Layers3, Music, Package, Search, Sparkles, UserRound, Volume2, Waypoints, type LucideIcon } from 'lucide-react'
import type { LocaleCode } from '@locales'
import type { GameDirectoryInfo } from '@shared/contracts'
import { loadImageDataUrl, loadResourceRegistry } from '@entities/game/api'
import type { ResourceRegistry, ResourceRegistryEntry } from '@entities/game/api'
import { detectDefaultGameDirectoryFromDevBridge } from '@entities/game/api/devAssetBridge'
import {
  getItemKindLabel,
  loadItemTextureAssetState,
  loadItemWorkspaceEntries,
  type ItemTextureAssetState,
  type ItemWorkspaceEntry,
} from '@pages/workbench/workspaces/item/entities/item'
import { configureImageDataUrlLoader } from '@shared/lib/assets'
import { configureDesktopPlatformPorts } from '@shared/lib/desktop'
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

const FALLBACK_LOAD_MESSAGE = '未连接游戏目录，当前使用静态 fallback 资源。'

type BrowserRegistryState = {
  registry: EventResourceRegistry | null
  loadState: ResourceLoadState
  loadMessage: string
}

type BrowserRegistryAction =
  | { type: 'fallback'; message?: string }
  | { type: 'loading'; message: string }
  | { type: 'loaded'; registry: EventResourceRegistry; loadState: 'loaded' | 'partial'; message: string }

function browserRegistryReducer(_state: BrowserRegistryState, action: BrowserRegistryAction): BrowserRegistryState {
  switch (action.type) {
    case 'fallback':
      return {
        registry: null,
        loadState: 'fallback',
        loadMessage: action.message ?? FALLBACK_LOAD_MESSAGE,
      }
    case 'loading':
      return {
        registry: null,
        loadState: 'loading',
        loadMessage: action.message,
      }
    case 'loaded':
      return {
        registry: action.registry,
        loadState: action.loadState,
        loadMessage: action.message,
      }
  }
}

const RESOURCE_KINDS: Array<{
  kind: EventResourceKind
  title: string
  description: string
  placeholder: string
  icon: LucideIcon
  tone: string
}> = [
  {
    kind: 'actor',
    title: '角色',
    description: 'NPC、临时演员、当前项目中收集到的角色名。',
    placeholder: '搜索角色或输入自定义 actor',
    icon: UserRound,
    tone: '#22c55e',
  },
  {
    kind: 'item',
    title: '物品',
    description: '原版物品 ID 与项目脚本中出现的物品参数。',
    placeholder: '搜索物品、ID 或名称',
    icon: Package,
    tone: '#f97316',
  },
  {
    kind: 'location',
    title: '场地',
    description: 'Data/Events 目标、地图名和事件命令中的位置。',
    placeholder: '搜索场地或地图名',
    icon: Waypoints,
    tone: '#14b8a6',
  },
  {
    kind: 'music',
    title: '音乐',
    description: '事件 scene setup 与 playMusic 使用的 music cue。',
    placeholder: '搜索 music cue',
    icon: Music,
    tone: '#ec4899',
  },
  {
    kind: 'sound',
    title: '音效',
    description: 'playSound 和脚本命令中出现的音效 cue。',
    placeholder: '搜索 sound cue',
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

function buildRegistryFromDesktopRegistry(desktopRegistry: ResourceRegistry, locale: LocaleCode): EventResourceRegistry {
  const registry = buildDefaultEventResourceRegistry(locale)

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

function countRegistryResources(registry: EventResourceRegistry) {
  return RESOURCE_KINDS.reduce((total, item) => total + registry[item.kind].length, 0)
}

function countResourceSources(options: EventResourceOption[]) {
  const counts = new Map<string, number>()
  for (const option of options) {
    const source = option.badge ?? option.subtitle ?? 'Unknown'
    counts.set(source, (counts.get(source) ?? 0) + 1)
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])
}

export function DevResourceBrowserLab({ locale = 'zh-CN', directoryInfo = null }: DevResourceBrowserLabProps) {
  const [detectedDevRootPath, setDetectedDevRootPath] = useState<string | null>(null)
  const [{ registry: collectedRegistry, loadState, loadMessage }, dispatchBrowserRegistry] = useReducer(browserRegistryReducer, {
    registry: null,
    loadState: 'fallback',
    loadMessage: FALLBACK_LOAD_MESSAGE,
  })
  const registry = useMemo(() => collectedRegistry ?? buildDefaultEventResourceRegistry(locale), [collectedRegistry, locale])
  const [selections, setSelections] = useState<Record<EventResourceKind, string>>(DEFAULT_SELECTIONS)
  const [activeKind, setActiveKind] = useState<EventResourceKind>('actor')
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
    dispatchBrowserRegistry({ type: 'loading', message: '正在从 Rust 全局资源注册表和物品目录加载...' })

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
      const nextRegistry = buildRegistryFromDesktopRegistry(desktopRegistry, locale)
      if (itemOptionsResult.options.length > 0) {
        nextRegistry.item = itemOptionsResult.options
      }

      const nextResourceCount = backendResourceCount + itemOptionsResult.options.length
      if (nextResourceCount === 0) {
        dispatchBrowserRegistry({
          type: 'fallback',
          message: desktopRegistry.warnings.length
            ? `Rust 注册表没有返回可用资源，已回退到静态 fallback。警告 ${desktopRegistry.warnings.length} 条。`
            : 'Rust 注册表返回空资源，已回退到静态 fallback。',
        })
        return
      }

      const hasWarnings = desktopRegistry.warnings.length > 0 || itemOptionsResult.error != null
      dispatchBrowserRegistry({
        type: 'loaded',
        registry: nextRegistry,
        loadState: hasWarnings ? 'partial' : 'loaded',
        message: hasWarnings
          ? `已加载部分资源：物品 ${itemOptionsResult.options.length} 个，Rust 警告 ${desktopRegistry.warnings.length} 条。`
          : `已加载 Rust 全局注册表和物品目录：物品 ${itemOptionsResult.options.length} 个。`,
      })
    }

    void collectResources().catch(() => {
      if (cancelled) {
        return
      }
      dispatchBrowserRegistry({ type: 'fallback', message: 'Rust 注册表加载失败，当前使用静态 fallback 资源。' })
    })

    return () => {
      cancelled = true
    }
  }, [effectiveRootPath, locale])

  const totalResources = countRegistryResources(registry)
  const activeResource = RESOURCE_KINDS.find((resource) => resource.kind === activeKind) ?? RESOURCE_KINDS[0]
  const activeSourceCounts = countResourceSources(registry[activeKind])
  const projectResourceCount = RESOURCE_KINDS.reduce(
    (total, resource) =>
      total + registry[resource.kind].filter((option) => option.badge === '当前项目' || option.badge === 'Project').length,
    0,
  )

  return (
    <main className="dev-resource-browser">
      <header className="dev-resource-browser__header">
        <div className="min-w-0">
          <div className="dev-resource-browser__title-row">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <h1>资源浏览器</h1>
            <span className="dev-resource-browser__badge">DEV</span>
            <span className="dev-resource-browser__badge">{loadState}</span>
          </div>
          <p className="dev-resource-browser__subtitle">{loadMessage}</p>
        </div>
        <div className="dev-resource-browser__metrics">
          <span className="dev-resource-browser__metric">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{totalResources}</span>
          </span>
          <span className="dev-resource-browser__metric">
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{projectResourceCount} project</span>
          </span>
        </div>
      </header>

      <div className="dev-resource-browser__dialog-stage">
        <section className="dev-resource-browser__dialog-panel" aria-label="资源浏览器弹窗测试">
          <div className="dev-resource-browser__dialog-head">
            <div className="min-w-0">
              <h2>弹窗测试台</h2>
              <p>点击右侧按钮打开真实资源浏览器弹窗，验证搜索、选择、自定义值、Esc 和遮罩关闭。</p>
            </div>
            <span className="dev-resource-browser__badge">{activeResource.title} active</span>
          </div>

          <div className="dev-resource-browser__dialog-grid">
            {RESOURCE_KINDS.map((resource) => {
              const Icon = resource.icon
              const selected = registry[resource.kind].find((option) => option.value === selections[resource.kind])
              const active = resource.kind === activeKind

              return (
                <div key={resource.kind} className="dev-resource-browser__dialog-row" data-active={active ? 'true' : undefined}>
                  <span className="dev-resource-browser__icon-box" style={{ color: resource.tone }} aria-hidden="true">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="dev-resource-browser__dialog-copy">
                    <span className="dev-resource-browser__label">{resource.title}</span>
                    <span className="dev-resource-browser__tiny">{resource.description}</span>
                  </span>
                  <span className="dev-resource-browser__count">{registry[resource.kind].length}</span>
                  <EventResourcePicker
                    value={selections[resource.kind]}
                    label={`${resource.title}资源浏览器`}
                    placeholder={resource.placeholder}
                    options={registry[resource.kind]}
                    selectionMode="confirm"
                    onSelect={(value) => {
                      setActiveKind(resource.kind)
                      setSelections((current) => ({
                        ...current,
                        [resource.kind]: value,
                      }))
                    }}
                    triggerClassName="dev-resource-browser__picker-trigger"
                  />
                  <span className="dev-resource-browser__dialog-selection">{selected?.label ?? selections[resource.kind]}</span>
                </div>
              )
            })}
          </div>

          <div className="dev-resource-browser__dialog-footer">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {activeSourceCounts.slice(0, 4).map(([source, count]) => (
              <span key={source} className="dev-resource-browser__source-chip">
                {activeResource.title} {source}: {count}
              </span>
            ))}
          </div>
        </section>

        <aside className="dev-resource-browser__dialog-side">
          <section>
            <h2>当前选择</h2>
            <div className="dev-resource-browser__selection-list">
              {RESOURCE_KINDS.map((resource) => {
                const selected = registry[resource.kind].find((option) => option.value === selections[resource.kind])

                return (
                  <button
                    key={resource.kind}
                    type="button"
                    className="dev-resource-browser__selection"
                    onClick={() => setActiveKind(resource.kind)}
                  >
                    <span className="dev-resource-browser__swatch" style={{ backgroundColor: resource.tone }} aria-hidden="true" />
                    <span className="dev-resource-browser__selection-copy">
                      <span className="dev-resource-browser__tiny">{resource.title}</span>
                      <strong className="dev-resource-browser__selection-label">{selected?.label ?? selections[resource.kind]}</strong>
                      <span className="dev-resource-browser__tiny">{selected?.subtitle ?? selections[resource.kind]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}

export default DevResourceBrowserLab
