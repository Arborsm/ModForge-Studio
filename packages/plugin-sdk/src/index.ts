/**
 * @file ModForge Plugin SDK — the public API surface for code-package compat
 * plugins. Plugins import from `@modforge/plugin-sdk` (resolved via import map
 * to `/vendor/plugin-sdk.js` in the webview) and call `activate(ctx)` to
 * register pages, components and cleanup hooks.
 *
 * Semver discipline: the SDK surface is append-only. Breaking changes must bump
 * the major version; the host rejects plugins whose manifest `sdkVersion` major
 * does not match.
 */

// ── Page registration ───────────────────────────────────────────────────────

/** Navigation section for a plugin page. */
export type PluginPageSection = 'tools' | 'editors' | 'settings'

/** Navigation icon name (clamped to the host's known icon set). */
export type PluginPageIcon = 'images' | 'package' | 'code' | 'palette' | 'settings'

/** Presentation mode for a plugin page. */
export type PluginPagePresentation = 'standalone' | 'embedded'

/** Project access level for a plugin page. */
export type PluginProjectAccess = 'none' | 'read' | 'readWrite'

/** A page contribution registered by a plugin via `PluginContext.registerPage`. */
export interface PluginPageContribution {
  /** Unique page id within the plugin (combined with plugin id for the module id). */
  id: string
  /** Navigation section. */
  section: PluginPageSection
  /** Sort order within the section. */
  order: number
  /** Navigation icon. */
  icon: PluginPageIcon
  /** i18n key for the page title (resolved from the plugin's i18n bundle). */
  titleKey: string
  /** Presentation mode. */
  presentation: PluginPagePresentation
  /** Project access level. */
  projectAccess: PluginProjectAccess
  /** The React component to render for this page. */
  component: ReactComponentType
}

// ── Host commands ────────────────────────────────────────────────────────────

/** Allowlisted host command names available to plugins. */
export type PluginCommandName = 'readModFile' | 'writeModFile' | 'listModDirectory' | 'readPluginAsset' | 'resolveTargetModRoot'

/** Allowlisted host command interface. */
export interface PluginCommands {
  /** Invokes an allowlisted host command. Not a generic invoke passthrough. */
  invoke<T>(name: PluginCommandName, args?: unknown): Promise<T>
}

// ── Capabilities ─────────────────────────────────────────────────────────────

/** Built-in capability lookup by id. */
export interface PluginCapabilities {
  /** Returns a built-in capability by id, or undefined if not found. */
  get(id: string): unknown
}

// ── i18n ─────────────────────────────────────────────────────────────────────

/** Plugin locale lookup (bundle registered from manifest i18n). */
export interface PluginI18n {
  /** Returns the localized string for the given key, or the key itself if not found. */
  t(key: string): string
}

// ── Components ───────────────────────────────────────────────────────────────

/** Minimal React component type (avoids hard react dependency in type-only position). */
export type ReactComponentType<P = Record<string, unknown>> = (props: P) => unknown

/** Design-system component subset exposed to plugins (token-styled). */
export interface PluginComponents {
  CompactSelect: ReactComponentType
  PanelFrame: ReactComponentType
  PanelSection: ReactComponentType
  EmptyStateCard: ReactComponentType
}

// ── Plugin context ───────────────────────────────────────────────────────────

/** The context passed to a plugin's `activate` function. */
export interface PluginContext {
  /** Registers a workbench page with the host's module registry. */
  registerPage(page: PluginPageContribution): void
  /** Design-system component subset (token-styled). */
  components: PluginComponents
  /** Allowlisted host commands; paths scoped to mod/project roots. */
  commands: PluginCommands
  /** Built-in capability lookup by id. */
  capabilities: PluginCapabilities
  /** Plugin locale lookup (bundle registered from manifest i18n). */
  i18n: PluginI18n
  /** Registers a cleanup function run on plugin unload/reload. */
  onDispose(fn: () => void): void
}

/** The module interface a plugin code package must export as default. */
export interface PluginModule {
  /** Called once on plugin load; receives the PluginContext for registration. */
  activate(ctx: PluginContext): void
  /** Optional: the SDK major version this plugin targets (checked against host). */
  sdkVersion?: string
}

// ── Host-side helpers (not for plugin authors) ───────────────────────────────

/** Parses a semver string and returns the major version number. */
export function parseSdkMajor(version: string): number {
  const match = version.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

/** Checks if a plugin's sdkVersion is compatible with the host's SDK major version. */
export function isSdkVersionCompatible(pluginSdkVersion: string, hostSdkMajor: number): boolean {
  return parseSdkMajor(pluginSdkVersion) === hostSdkMajor
}
