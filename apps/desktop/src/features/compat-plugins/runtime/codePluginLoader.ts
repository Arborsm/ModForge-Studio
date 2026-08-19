/**
 * @file Code plugin loader: imports code-package entry points via the
 * `plugin://` protocol, validates SDK version compatibility, activates plugins
 * with a PluginContext, and collects registered pages into the module registry.
 * @module features/compat-plugins
 */
import type { PluginContext, PluginModule, PluginPageContribution } from '@modforge/plugin-sdk'
import { isSdkVersionCompatible, parseSdkMajor } from '@modforge/plugin-sdk'
import type { ComponentType, LazyExoticComponent } from 'react'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelSection } from '@shared/ui/PanelSection'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import type { CompatPluginSummary } from '../api/types'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { clampIcon, clampPresentation, clampProjectAccess, clampSection } from '../lib/buildCompatRegistrations'
import { getImportMapSupport } from '../lib/importMapSupport'
import { usePluginLocaleStore } from '../model/pluginLocaleStore'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'

/** The host's SDK major version. Plugins must match this to be loaded. */
export const HOST_SDK_MAJOR_VERSION = 1

/** Diagnostic entry for a plugin that failed to load. */
export type CodePluginLoadDiagnostic = {
  pluginId: string
  reason: string
  phase: 'import' | 'sdkVersion' | 'activate' | 'other'
}

/** Result of loading all code-package plugins. */
export type CodePluginLoadResult = {
  /** Successfully registered module registrations from activated plugins. */
  registrations: WorkbenchModuleRegistration[]
  /** Diagnostics for plugins that failed to load. */
  diagnostics: CodePluginLoadDiagnostic[]
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
  collectedPages: RegisteredPage[],
  disposeHooks: (() => void)[],
): PluginContext {
  // Resolve the plugin's i18n bundle from the plugin locale store.
  // The store is populated by registerPluginI18nBundles during bootstrap.
  const pluginLocaleStore = usePluginLocaleStore.getState()
  const bundles = pluginLocaleStore.bundles[pluginId] ?? {}

  // Resolve the target mod root for the plugin's first target (if any).
  // This is used by commands that need to read/write mod files.
  const targetUniqueId = pluginTargets[0] ?? null

  return {
    registerPage(page: PluginPageContribution) {
      collectedPages.push({ pluginId, page })
    },
    // Real design-system components from shared/ui (token-styled).
    components: {
      CompactSelect: CompactSelect as never,
      PanelFrame: PanelFrame as never,
      PanelSection: PanelSection as never,
      EmptyStateCard: EmptyStateCard as never,
    },
    commands: {
      async invoke<T>(name: string, args?: unknown): Promise<T> {
        switch (name) {
          case 'resolveTargetModRoot': {
            if (!targetUniqueId) return null as T
            const { resolveTargetModRoot } = await import('../lib/resolveTargetModRoot')
            return (await resolveTargetModRoot(targetUniqueId)) as T
          }
          case 'listModDirectory': {
            const { listCompatPluginEntries } = await import('../api/directoryPackApi')
            const params = (args ?? {}) as { rootSubdir: string; entryFile: string; entryImage?: string }
            if (!targetUniqueId) return [] as T
            const { resolveTargetModRoot } = await import('../lib/resolveTargetModRoot')
            const modRoot = await resolveTargetModRoot(targetUniqueId)
            if (!modRoot) return [] as T
            return (await listCompatPluginEntries({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryFile: params.entryFile,
              entryImage: params.entryImage,
            })) as T
          }
          case 'readModFile': {
            const { readCompatPluginEntry } = await import('../api/directoryPackApi')
            const params = (args ?? {}) as { rootSubdir: string; entryId: string; entryFile: string }
            if (!targetUniqueId) return null as T
            const { resolveTargetModRoot } = await import('../lib/resolveTargetModRoot')
            const modRoot = await resolveTargetModRoot(targetUniqueId)
            if (!modRoot) return null as T
            return (await readCompatPluginEntry({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryId: params.entryId,
              entryFile: params.entryFile,
            })) as T
          }
          case 'writeModFile': {
            const { writeCompatPluginEntry } = await import('../api/directoryPackApi')
            const params = (args ?? {}) as { rootSubdir: string; entryId: string; entryFile: string; content: Record<string, unknown> }
            if (!targetUniqueId) return undefined as T
            const { resolveTargetModRoot } = await import('../lib/resolveTargetModRoot')
            const modRoot = await resolveTargetModRoot(targetUniqueId)
            if (!modRoot) return undefined as T
            await writeCompatPluginEntry({
              modRoot,
              rootSubdir: params.rootSubdir,
              entryId: params.entryId,
              entryFile: params.entryFile,
              content: params.content,
            })
            return undefined as T
          }
          case 'readPluginAsset': {
            // Plugin assets are served via the plugin:// protocol; the host
            // resolves the URL and fetches it. This is a read-only operation.
            const assetPath = (args as { path?: string })?.path ?? ''
            const url = `plugin://${pluginId}/${assetPath}`
            const response = await fetch(url)
            return (await response.text()) as T
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
          default:
            return undefined
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
    onDispose(fn: () => void) {
      disposeHooks.push(fn)
    },
  }
}

/** Converts a registered plugin page to a WorkbenchModuleRegistration. */
function registeredPageToModuleRegistration(
  registered: RegisteredPage,
  createRuntime: (moduleId: string) => () => LazyExoticComponent<ComponentType>,
): WorkbenchModuleRegistration {
  const moduleId = `compat-${registered.pluginId}:${registered.page.id}`
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
    createRuntime: createRuntime(moduleId),
    persistenceKey: moduleId,
  }
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
 * Returns the collected module registrations and diagnostics for failed plugins.
 */
export async function loadCodePlugins(
  plugins: readonly CompatPluginSummary[],
  createRuntime: (moduleId: string) => () => LazyExoticComponent<ComponentType>,
): Promise<CodePluginLoadResult> {
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
    return { registrations, diagnostics }
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
    const entryPath = `plugin://${pluginId}/${entryFile}`

    try {
      const module = (await import(/* @vite-ignore */ entryPath)) as { default?: PluginModule }
      const pluginModule = module.default

      if (!pluginModule) {
        diagnostics.push({
          pluginId,
          reason: 'Plugin module has no default export',
          phase: 'import',
        })
        continue
      }

      // Activate the plugin with a context that collects registrations.
      const ctx = createPluginContext(pluginId, plugin.targets, collectedPages, disposeHooks)
      pluginModule.activate(ctx)

      // Convert collected pages for this plugin to module registrations.
      for (const registered of collectedPages.filter((p) => p.pluginId === pluginId)) {
        registrations.push(registeredPageToModuleRegistration(registered, createRuntime))
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        pluginId,
        reason,
        phase: 'activate',
      })
    }
  }

  return { registrations, diagnostics }
}
