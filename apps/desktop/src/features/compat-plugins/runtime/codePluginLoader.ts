/**
 * @file Code plugin loader: imports code-package entry points via the
 * `plugin://` protocol, injects manifest-declared stylesheets, validates SDK
 * version compatibility, activates plugins with a PluginContext, and collects
 * registered pages into the module registry.
 * @module features/compat-plugins
 */
import type { PluginContext, PluginModule, PluginNotificationRequest, PluginPageContribution } from '@modforge/plugin-sdk'
import { isSdkVersionCompatible, parseSdkMajor } from '@modforge/plugin-sdk'
import { lazy, type ComponentType } from 'react'
import { pluginHostComponents } from './pluginHostComponents.generated'
import { dismissNotification, type NotificationLevel } from '@shared/ui/notifications'
import { detectDefaultGameDirectory, loadImageDataUrl, loadTextAsset, loadXactAudioDataUrl, scanAudioAssets } from '@entities/game/api'
import { resolveGameAudioCueKind } from '@entities/map/lib/musicCues'
import type { CompatPluginSummary } from '../api/types'
import { COMPAT_CAPABILITIES } from '../lib/capabilities'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { clampIcon, clampPresentation, clampProjectAccess, clampSection } from '../lib/buildCompatRegistrations'
import { getImportMapSupport } from '../lib/importMapSupport'
import { resolveTargetMod, resolveTargetModRoot } from '../lib/resolveTargetModRoot'
import {
  directoryPackSourceName,
  isPathWithinDirectory,
  listAggregatedDirectoryPackEntries,
  listTaggedDirectoryPackEntries,
} from '../lib/directoryPackSources'
import {
  deleteCompatPluginEntry,
  readCompatPluginEntry,
  writeCompatPluginEntry,
  writeCompatPluginEntryImage,
} from '../api/directoryPackApi'
import { usePluginLocaleStore } from '../model/pluginLocaleStore'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { getPlatformPorts } from '@platform/host/runtime'
import { appEvent, orNull } from '@platform/observability'

/** The host's SDK major version. Plugins must match this to be loaded. */
export const HOST_SDK_MAJOR_VERSION = 1

/**
 * Resolves a `plugin://` resource URL through the platform port. The concrete
 * URL form is host-specific (Tauri Windows uses `http://plugin.localhost`,
 * Tauri macOS/Linux uses `plugin://localhost`, Electron uses a real scheme), so
 * this must never be string-built inline.
 *
 * When `epoch` is provided, a `__v<N>/` path segment is inserted after the
 * plugin id so the webview module cache misses on hot-reload (the entry URL and
 * every relative sub-import resolve under the new versioned path). Runtime
 * asset reads (`readPluginAsset`) omit `epoch` since they fetch current disk
 * content and do not participate in the module cache.
 */
function resolvePluginResourceUrl(pluginId: string, relativePath: string, epoch?: number): string {
  return getPlatformPorts().fileSystem.resolvePluginUrl(pluginId, relativePath, epoch)
}

/** Diagnostic entry for a plugin that failed to load. */
export type CodePluginLoadDiagnostic = {
  pluginId: string
  reason: string
  phase: 'import' | 'sdkVersion' | 'styles' | 'activate' | 'other'
}

/** Result of loading all code-package plugins. */
export type CodePluginLoadResult = {
  /** Successfully registered module registrations from activated plugins. */
  registrations: WorkbenchModuleRegistration[]
  /** Diagnostics for plugins that failed to load. */
  diagnostics: CodePluginLoadDiagnostic[]
  /** Dispose hooks collected from activated plugins; the caller owns their lifecycle. */
  disposeHooks: (() => void)[]
}

/** Registered page from a plugin's `activate` call. */
type RegisteredPage = {
  pluginId: string
  page: PluginPageContribution
}

/** Creates a PluginContext for a specific plugin that collects registrations and dispose hooks. */
function createPluginContext(
  pluginId: string,
  pluginTargets: readonly string[],
  declaredCapabilities: readonly string[],
  collectedPages: RegisteredPage[],
  disposeHooks: (() => void)[],
): PluginContext {
  // Resolve the plugin's i18n bundle from the plugin locale store.
  // The store is populated by registerPluginI18nBundles during bootstrap.
  const pluginLocaleStore = usePluginLocaleStore.getState()
  const bundles = pluginLocaleStore.bundles[pluginId] ?? {}

  // Commands resolve the target mod root from the plugin's declared targets
  // (tried in order, so a mod's historical UniqueIDs keep working).
  const targetUniqueIds = pluginTargets

  // Game directory lookups are shared by the game asset commands and cached
  // per plugin so repeated asset loads only resolve once.
  let gameRootPromise: Promise<string | null> | null = null
  const resolveGameRoot = () => {
    gameRootPromise ??= orNull(detectDefaultGameDirectory(), 'codePluginLoader.detectGameRoot')
    return gameRootPromise
  }

  // Notifications published by this plugin are tracked so dispose can retract
  // everything the plugin left on screen.
  const publishedNotificationIds: string[] = []
  const namespaceNotificationId = (id: string) => (id.startsWith(`plugin:${pluginId}:`) ? id : `plugin:${pluginId}:${id}`)
  const notificationLevels = new Set<NotificationLevel>(['success', 'info', 'warning', 'error'])
  disposeHooks.push(() => {
    for (const id of publishedNotificationIds) {
      dismissNotification(id)
    }
    publishedNotificationIds.length = 0
  })

  // Real design-system components from shared/ui (token-styled), wired by the
  // generated pluginHostComponents module. Its `PluginComponents` annotation is
  // the drift guard: host tsc fails when a real component's props no longer
  // satisfy the SDK's plugin-facing declarations.
  const components = pluginHostComponents

  /**
   * Resolves the mod root a readModFile/writeModFile call targets. When the
   * plugin passes `sourceModRoot` (a root previously returned by
   * `listModDirectory`), it is used directly after validating that it nests
   * under the Mods directory — plugins must not escape into arbitrary paths.
   * Without it, falls back to the target mod root (legacy behavior).
   */
  const resolveSourceModRoot = async (sourceModRoot: string | undefined): Promise<string | null> => {
    if (sourceModRoot) {
      const gameRoot = await resolveGameRoot()
      if (!gameRoot) return null
      if (!isPathWithinDirectory(`${gameRoot}/Mods`, sourceModRoot)) return null
      return sourceModRoot
    }
    if (targetUniqueIds.length === 0) return null
    return resolveTargetModRoot(targetUniqueIds)
  }

  return {
    registerPage(page: PluginPageContribution) {
      collectedPages.push({ pluginId, page })
    },
    components,
    commands: {
      async invoke<T>(name: string, args?: unknown): Promise<T> {
        switch (name) {
          case 'resolveTargetModRoot': {
            if (targetUniqueIds.length === 0) return null as T
            return (await resolveTargetModRoot(targetUniqueIds)) as T
          }
          case 'listModDirectory': {
            const params = (args ?? {}) as { rootSubdir: string; entryFile: string; entryImage?: string; includeContentPacks?: boolean }
            if (targetUniqueIds.length === 0) return [] as T
            if (params.includeContentPacks === true) {
              // Aggregate across the target mod and every installed content
              // pack whose ContentPackFor targets it; each entry is tagged
              // with its source root so reads/writes route back correctly.
              return (await listAggregatedDirectoryPackEntries(targetUniqueIds, params)) as T
            }
            const targetMod = await resolveTargetMod(targetUniqueIds)
            if (!targetMod) return [] as T
            return (await listTaggedDirectoryPackEntries(
              { modRoot: targetMod.absolutePath, modName: directoryPackSourceName(targetMod) },
              params,
            )) as T
          }
          case 'readModFile': {
            const params = (args ?? {}) as { rootSubdir: string; entryId: string; entryFile: string; sourceModRoot?: string }
            const modRoot = await resolveSourceModRoot(params.sourceModRoot)
            if (!modRoot) return null as T
            return (await readCompatPluginEntry({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryId: params.entryId,
              entryFile: params.entryFile,
            })) as T
          }
          case 'writeModFile': {
            const params = (args ?? {}) as {
              rootSubdir: string
              entryId: string
              entryFile: string
              content: Record<string, unknown>
              sourceModRoot?: string
            }
            const modRoot = await resolveSourceModRoot(params.sourceModRoot)
            if (!modRoot) {
              // An explicitly supplied but invalid sourceModRoot is a rejected
              // write, not a silent no-op.
              if (params.sourceModRoot) throw new Error('writeModFile: sourceModRoot must nest under the Mods directory')
              return undefined as T
            }
            await writeCompatPluginEntry({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryId: params.entryId,
              entryFile: params.entryFile,
              content: params.content,
            })
            return undefined as T
          }
          case 'deleteModEntry': {
            const params = (args ?? {}) as { rootSubdir: string; entryId: string; sourceModRoot?: string }
            const modRoot = await resolveSourceModRoot(params.sourceModRoot)
            if (!modRoot) {
              if (params.sourceModRoot) throw new Error('deleteModEntry: sourceModRoot must nest under the Mods directory')
              return undefined as T
            }
            await deleteCompatPluginEntry({ modRoot, rootSubdir: params.rootSubdir, entryId: params.entryId })
            return undefined as T
          }
          case 'writeModEntryImage': {
            const params = (args ?? {}) as {
              rootSubdir: string
              entryId: string
              imageFile: string
              contentBase64: string
              sourceModRoot?: string
            }
            const modRoot = await resolveSourceModRoot(params.sourceModRoot)
            if (!modRoot) {
              if (params.sourceModRoot) throw new Error('writeModEntryImage: sourceModRoot must nest under the Mods directory')
              return undefined as T
            }
            await writeCompatPluginEntryImage({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryId: params.entryId,
              imageFile: params.imageFile,
              contentBase64: params.contentBase64,
            })
            return undefined as T
          }
          case 'loadModImage': {
            // Reads an image file (e.g. an entry's texture.png) as a data URL.
            // The path must nest under the Mods directory — plugins never get
            // arbitrary filesystem reads.
            const params = (args ?? {}) as { path: string }
            const gameRoot = await resolveGameRoot()
            if (!gameRoot) return null as T
            if (!isPathWithinDirectory(`${gameRoot}/Mods`, params.path)) {
              throw new Error('loadModImage: path must nest under the Mods directory')
            }
            return (await loadImageDataUrl(params.path)) as T
          }
          case 'readPluginAsset': {
            // Plugin assets are served via the plugin:// protocol; the host
            // resolves the URL and fetches it. This is a read-only operation.
            const assetPath = (args as { path?: string })?.path ?? ''
            const url = resolvePluginResourceUrl(pluginId, assetPath)
            const response = await fetch(url)
            if (!response.ok) {
              throw new Error(`readPluginAsset failed (HTTP ${response.status}): ${assetPath}`)
            }
            return (await response.text()) as T
          }
          case 'resolveGameRoot': {
            return (await resolveGameRoot()) as T
          }
          case 'loadGameDataAsset': {
            // Plugin-facing arg is a Content Patcher-style asset key (e.g.
            // 'Data/Objects'); the host maps it onto Content/<key>.xnb.
            const params = (args ?? {}) as { assetPath: string; locale?: string }
            const root = await resolveGameRoot()
            if (!root) throw new Error('Game directory not found')
            const relative = /\.(xnb|json)$/i.test(params.assetPath) ? params.assetPath : `${params.assetPath}.xnb`
            return (await loadTextAsset(root, `Content/${relative}`, params.locale)) as T
          }
          case 'loadGameImage': {
            const params = (args ?? {}) as { contentPath: string; locale?: string }
            const root = await resolveGameRoot()
            if (!root) throw new Error('Game directory not found')
            return (await loadImageDataUrl(`${root}/Content/${params.contentPath}.xnb`, params.locale)) as T
          }
          case 'scanGameAudio': {
            const root = await resolveGameRoot()
            if (!root) return [] as T
            const assets = await scanAudioAssets(root)
            // The XACT scanner cannot distinguish music from sound effects
            // (both live in the same sound bank), so reclassify with the known
            // vanilla music cue list — the same source the audio workspace uses.
            return assets.map((asset) => ({
              ...asset,
              kind: resolveGameAudioCueKind(asset.cue, asset.kind === 'music' ? 'music' : 'sound'),
            })) as T
          }
          case 'loadGameAudioCue': {
            const params = (args ?? {}) as { cue: string }
            const root = await resolveGameRoot()
            if (!root) throw new Error('Game directory not found')
            return (await loadXactAudioDataUrl(root, params.cue)) as T
          }
          default:
            throw new Error(`Unknown plugin command: ${name}`)
        }
      },
    },
    capabilities: {
      get(id: string): unknown {
        // Built-in capabilities: the host exposes a small set of read-only
        // metadata that plugins can query at activation time.
        switch (id) {
          case 'plugin.id':
            return pluginId
          case 'plugin.targets':
            return pluginTargets
          case 'host.sdkVersion':
            return String(HOST_SDK_MAJOR_VERSION)
          case 'host.locale':
            return usePreferencesStore.getState().locale ?? 'en-US'
          default:
            // Host capabilities: only ids the plugin's own manifest declared
            // AND that exist in the host registry are reachable. An
            // undeclared or unknown id returns undefined so a plugin cannot
            // reach host code it did not opt into.
            if (!declaredCapabilities.includes(id)) {
              return undefined
            }
            return COMPAT_CAPABILITIES[id]
        }
      },
    },
    i18n: {
      t(key: string): string {
        // Resolve from the current locale's bundle; falls back to the key.
        // The plugin locale store holds bundles keyed by locale code.
        const currentLocale = usePreferencesStore.getState().locale ?? 'en-US'
        const entries = bundles[currentLocale] ?? bundles['en-US']
        return entries?.[key] ?? key
      },
    },
    notifications: {
      publish(request: PluginNotificationRequest): string {
        const id = namespaceNotificationId(request.id?.trim() || crypto.randomUUID())
        const level = notificationLevels.has(request.level as NotificationLevel) ? (request.level as NotificationLevel) : 'info'
        appEvent(level, String(request.title ?? ''))
          .summary(request.summary ?? null)
          .note(request.note ?? null)
          .noticeId(id)
          .autoDismiss(request.autoDismissMs ?? 4000)
          .context({ source: 'compat-plugin-loader', operation: 'publish-plugin-notification' })
          .emit()
        publishedNotificationIds.push(id)
        return id
      },
      dismiss(id: string) {
        dismissNotification(namespaceNotificationId(id))
      },
    },
    onDispose(fn: () => void) {
      disposeHooks.push(fn)
    },
  }
}

/** Converts a registered plugin page to a WorkbenchModuleRegistration. */
function registeredPageToModuleRegistration(registered: RegisteredPage): WorkbenchModuleRegistration {
  const moduleId = `compat-${registered.pluginId}:${registered.page.id}`
  // Code-package pages render the plugin's own component (supplied via
  // `registerPage`), wrapped in lazy so the registry contract is honoured.
  const component = registered.page.component as ComponentType
  return {
    id: moduleId,
    navigation: {
      section: clampSection(registered.page.section),
      order: registered.page.order,
      icon: clampIcon(registered.page.icon),
      pluginLabel: { pluginId: registered.pluginId, key: registered.page.titleKey },
    },
    presentation: clampPresentation(registered.page.presentation),
    projectAccess: clampProjectAccess(registered.page.projectAccess),
    createRuntime: () => lazy(async () => ({ default: component })),
    persistenceKey: moduleId,
  }
}

/** Minimal DOM surface needed to host a plugin stylesheet (injectable for tests). */
export type PluginStyleHost = {
  createElement(tag: 'style'): { textContent: string; remove(): void; setAttribute(name: string, value: string): void }
  head: { appendChild(el: unknown): void }
}

/**
 * Injects a plugin's manifest-declared stylesheet as one `<style>` element and
 * returns the dispose hook that removes it. Element identity is keyed by
 * plugin id so reloads and other plugins never collide; scoping the selectors
 * themselves remains the plugin author's responsibility (prefixed classes).
 */
export function injectPluginStyles(host: PluginStyleHost, pluginId: string, cssText: string): () => void {
  const el = host.createElement('style')
  el.setAttribute('data-compat-plugin-styles', pluginId)
  el.textContent = cssText
  host.head.appendChild(el)
  return () => el.remove()
}

/**
 * Fetches and injects the plugin's declared stylesheet via the plugin://
 * protocol. `epoch` versions the URL so hot-reload bypasses the webview fetch
 * cache the same way it busts the module cache for the entry.
 */
async function loadPluginStyles(pluginId: string, stylesPath: string, epoch?: number): Promise<() => void> {
  const response = await fetch(resolvePluginResourceUrl(pluginId, stylesPath, epoch))
  if (!response.ok) {
    throw new Error(`styles fetch failed (HTTP ${response.status}): ${stylesPath}`)
  }
  return injectPluginStyles(document, pluginId, await response.text())
}

/** Disposes all previously loaded code plugins by running their onDispose hooks. */
export function disposeCodePlugins(disposeHooks: (() => void)[]): void {
  for (const fn of disposeHooks) {
    try {
      fn()
    } catch {
      // Dispose errors are non-fatal; the plugin is being unloaded anyway.
    }
  }
  disposeHooks.length = 0
}

/**
 * Loads all code-package plugins from the given summaries. For each plugin with
 * `hasCodeEntry: true`, imports the entry point via `plugin://<id>/<entry>`,
 * validates SDK version compatibility, and activates the plugin with a
 * PluginContext. Data-pack plugins (hasCodeEntry: false) are skipped.
 *
 * When `epoch` is provided, the entry URL is versioned with a `__v<N>/` path
 * segment so hot-reload bypasses the webview module cache for the entry and all
 * relative sub-imports. Initial load omits `epoch` (cache is cold).
 *
 * Returns the collected module registrations, diagnostics for failed plugins,
 * and the dispose hooks the caller must run on unload/reload.
 */
export async function loadCodePlugins(plugins: readonly CompatPluginSummary[], epoch?: number): Promise<CodePluginLoadResult> {
  const registrations: WorkbenchModuleRegistration[] = []
  const diagnostics: CodePluginLoadDiagnostic[] = []
  const collectedPages: RegisteredPage[] = []
  const disposeHooks: (() => void)[] = []

  // Check import map support before attempting any code-package loading.
  // If the webview does not support import maps, all code-package plugins
  // are rejected with a diagnostic. Data-pack plugins are unaffected.
  const importMapSupport = getImportMapSupport()
  if (!importMapSupport.supported) {
    for (const plugin of plugins) {
      if (!plugin.hasCodeEntry) continue
      diagnostics.push({
        pluginId: plugin.id,
        reason: `Import maps not supported: ${importMapSupport.reason}`,
        phase: 'other',
      })
    }
    return { registrations, diagnostics, disposeHooks }
  }

  for (const plugin of plugins) {
    if (!plugin.hasCodeEntry) continue

    const pluginId = plugin.id

    // Validate SDK version from manifest before attempting import.
    const manifestSdkVersion = plugin.sdkVersion ?? '0.0.0'
    if (!isSdkVersionCompatible(manifestSdkVersion, HOST_SDK_MAJOR_VERSION)) {
      diagnostics.push({
        pluginId,
        reason: `SDK version mismatch: manifest targets v${parseSdkMajor(manifestSdkVersion)}, host requires v${HOST_SDK_MAJOR_VERSION}`,
        phase: 'sdkVersion',
      })
      continue
    }

    // Entry path from manifest; fall back to "index.js" if missing.
    const entryFile = plugin.entry ?? 'index.js'
    const entryPath = resolvePluginResourceUrl(pluginId, entryFile, epoch)

    // Manifest-declared stylesheet: injected before activation so pages never
    // render unstyled. A missing/unreadable stylesheet is non-fatal — the page
    // still loads and the failure surfaces as a diagnostic in the manager.
    // Hooks land in a per-plugin bucket first: if activation below fails, they
    // run immediately so a rejected plugin leaves no styles behind.
    const pluginDisposeHooks: (() => void)[] = []
    if (plugin.styles) {
      try {
        pluginDisposeHooks.push(await loadPluginStyles(pluginId, plugin.styles, epoch))
      } catch (error) {
        diagnostics.push({
          pluginId,
          reason: error instanceof Error ? error.message : String(error),
          phase: 'styles',
        })
      }
    }

    try {
      const module = (await import(/* @vite-ignore */ entryPath)) as { default?: PluginModule }
      const pluginModule = module.default

      if (!pluginModule) {
        diagnostics.push({
          pluginId,
          reason: 'Plugin module has no default export',
          phase: 'import',
        })
        disposeCodePlugins(pluginDisposeHooks)
        continue
      }

      // Activate the plugin with a context that collects registrations into a
      // per-plugin dispose bucket. If activate() throws mid-way, any onDispose
      // hooks the plugin already registered are cleaned up immediately so a
      // rejected plugin leaves no notification-retraction / BGM-stop / style
      // hooks behind. Only on successful activation do the hooks graduate to
      // the global bucket that the caller owns for the plugin's lifetime.
      const ctx = createPluginContext(pluginId, plugin.targets, plugin.capabilities, collectedPages, pluginDisposeHooks)
      pluginModule.activate(ctx)

      // Activation succeeded: the plugin's hooks (styles + onDispose) stay
      // mounted until unload.
      disposeHooks.push(...pluginDisposeHooks)

      // Convert collected pages for this plugin to module registrations.
      for (const registered of collectedPages.filter((p) => p.pluginId === pluginId)) {
        registrations.push(registeredPageToModuleRegistration(registered))
      }
    } catch (error) {
      disposeCodePlugins(pluginDisposeHooks)
      const reason = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        pluginId,
        reason,
        phase: 'activate',
      })
    }
  }

  return { registrations, diagnostics, disposeHooks }
}
