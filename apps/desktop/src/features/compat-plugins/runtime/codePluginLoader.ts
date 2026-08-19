/**
 * @file Code plugin loader: imports code-package entry points via the
 * `plugin://` protocol, validates SDK version compatibility, activates plugins
 * with a PluginContext, and collects registered pages into the module registry.
 * @module features/compat-plugins
 */
import type { PluginContext, PluginModule, PluginPageContribution } from '@modforge/plugin-sdk'
import { isSdkVersionCompatible, parseSdkMajor } from '@modforge/plugin-sdk'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { CompatPluginSummary } from '../api/types'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { clampIcon, clampPresentation, clampProjectAccess, clampSection } from '../lib/buildCompatRegistrations'

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
  i18nBundle: Record<string, string> | undefined,
  collectedPages: RegisteredPage[],
  disposeHooks: (() => void)[],
): PluginContext {
  return {
    registerPage(page: PluginPageContribution) {
      collectedPages.push({ pluginId, page })
    },
    // Components are injected by the host at render time via import map;
    // the SDK package resolves these to the real components.
    components: {
      CompactSelect: (() => null) as never,
      PanelFrame: (() => null) as never,
      PanelSection: (() => null) as never,
      EmptyStateCard: (() => null) as never,
    },
    commands: {
      async invoke<T>(_name: string, _args?: unknown): Promise<T> {
        throw new Error('Plugin commands are not yet available in this build')
      },
    },
    capabilities: {
      get(_id: string): unknown {
        return undefined
      },
    },
    i18n: {
      t(key: string): string {
        return i18nBundle?.[key] ?? key
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

  for (const plugin of plugins) {
    if (!plugin.hasCodeEntry) continue

    const pluginId = plugin.id
    try {
      // The entry path is determined by the manifest's `entry` field (default: "index.js").
      // For now, we use the default entry. The manifest's entry field will be
      // available on the summary in a future wire type extension.
      const entryPath = `plugin://${pluginId}/index.js`

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

      // Validate SDK version compatibility.
      const pluginSdkVersion = pluginModule.sdkVersion ?? '0.0.0'
      if (!isSdkVersionCompatible(pluginSdkVersion, HOST_SDK_MAJOR_VERSION)) {
        diagnostics.push({
          pluginId,
          reason: `SDK version mismatch: plugin targets v${parseSdkMajor(pluginSdkVersion)}, host requires v${HOST_SDK_MAJOR_VERSION}`,
          phase: 'sdkVersion',
        })
        continue
      }

      // Activate the plugin with a context that collects registrations.
      const ctx = createPluginContext(pluginId, undefined, collectedPages, disposeHooks)
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
