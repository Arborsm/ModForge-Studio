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
import type { ReactComponentType } from './primitives'
import type { PluginGeneratedComponents } from './host-components.generated'

// ── Page registration ───────────────────────────────────────────────────────

/** Navigation section for a plugin page. Mirrors the host's WorkbenchNavigationSection. */
export type PluginPageSection = 'browse' | 'authoring' | 'translation' | 'tools' | 'development'

/**
 * Navigation icon name. The host clamps unknown icons to a fallback, so any
 * string is accepted; prefer the host's known set (`map`, `events`,
 * `characters`, `buildings`, `items`, `audio`, `package`, `languages`,
 * `files`, `beaker`, `book-open-check`, `book-open`, `dialogue`, `schedule`,
 * `mail`, `bug`, `settings`, `images`).
 */
export type PluginPageIcon = string

/** Presentation mode for a plugin page. Mirrors the host's registration contract. */
export type PluginPagePresentation = 'browser' | 'authoring' | 'standalone'

/** Project access level for a plugin page. Mirrors the host's registration contract. */
export type PluginProjectAccess = 'none' | 'read' | 'write'

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

/**
 * Allowlisted host command names available to plugins. `deleteModEntry` removes
 * an entry directory; `writeModEntryImage` writes a non-empty base64 image
 * (`png`, `jpg`, `jpeg` or `webp`, max 16 MiB). Both paths are relative to a
 * listed mod root and may use `sourceModRoot` only for a root under Mods.
 * `loadModImage` reads an image file under Mods as a data URL (read-only).
 */
export type PluginCommandName =
  | 'readModFile'
  | 'writeModFile'
  | 'deleteModEntry'
  | 'writeModEntryImage'
  | 'loadModImage'
  | 'listModDirectory'
  | 'readPluginAsset'
  | 'resolveTargetModRoot'
  | 'resolveGameRoot'
  | 'loadGameDataAsset'
  | 'loadGameImage'
  | 'scanGameAudio'
  | 'loadGameAudioCue'

/** Allowlisted host command interface. */
export interface PluginCommands {
  /** Invokes an allowlisted host command. Not a generic invoke passthrough. */
  invoke<T>(name: PluginCommandName, args?: unknown): Promise<T>
}

// ── Game asset payloads (returned by the game asset commands) ────────────────

/**
 * One directory-pack entry summary returned by `listModDirectory`. `id` is
 * pack-local; the entry identity is the (`sourceModRoot`, `id`) pair. Pass
 * `sourceModRoot` back to `readModFile`/`writeModFile` to route the operation
 * to the mod directory the entry was listed from (the target mod itself or a
 * content pack for it, when `includeContentPacks` was set).
 */
export interface PluginDirectoryEntry {
  id: string
  entryDir: string
  entryFilePath: string
  entryImagePath: string | null
  /** Absolute path of the mod root containing this entry (target mod or a content pack for it). */
  sourceModRoot: string
  /** Display name of the mod containing this entry. */
  sourceModName: string
}

/** Parsed text/data asset payload from `loadGameDataAsset`; `content` is the asset body (JSON-parseable for data assets). */
export interface PluginGameDataAsset {
  absolutePath: string
  relativePath: string
  content: string
}

/** Audio cue summary from `scanGameAudio`. */
export interface PluginAudioCueSummary {
  cue: string
  kind: 'music' | 'sound'
}

// ── Capabilities ─────────────────────────────────────────────────────────────

/**
 * Capability lookup by id.
 *
 * Built-in ids (`plugin.id`, `plugin.targets`, `host.sdkVersion`,
 * `host.locale`) are always available. Host capabilities are pure-function
 * implementations owned by the host core; to reach one, the plugin must first
 * declare its id in the manifest `contributions.capabilities` array.
 * Undeclared or unknown ids return `undefined`.
 */
export interface PluginCapabilities {
  /** Returns a capability by id, or undefined if not found or not declared. */
  get(id: string): unknown
}

// ── i18n ─────────────────────────────────────────────────────────────────────

/** Plugin locale lookup (bundle registered from manifest i18n). */
export interface PluginI18n {
  /** Returns the localized string for the given key, or the key itself if not found. */
  t(key: string): string
}

// ── Components ───────────────────────────────────────────────────────────────

/**
 * The `Plugin*` component props types and the `PluginGeneratedComponents`
 * surface are generated from the JSDoc and prop declarations of the real host
 * components in `apps/desktop/src/shared/ui/*.tsx` — see
 * `./host-components.generated.ts`. Regenerate with
 * `vp run --filter @modforge/desktop gen:plugin-docs`; hand edits to that file
 * are overwritten.
 *
 * `PluginReactNode` / `ReactComponentType` (the shared primitives) live in
 * `./primitives` so both the hand-written surface and the generated file can
 * import them without circular dependencies.
 */

export * from './primitives'
export * from './host-components.generated'

/** Design-system component subset exposed to plugins (token-styled). */
export interface PluginComponents extends PluginGeneratedComponents {}

// ── Notifications ─────────────────────────────────────────────────────────────

/** Notification severity; mirrors the host's shared notification levels. */
export type PluginNotificationLevel = 'success' | 'info' | 'warning' | 'error'

/** Notification payload for `PluginNotifications.publish`. */
export interface PluginNotificationRequest {
  /** Stable id within the plugin (auto-namespaced with the plugin id); reused ids replace the previous notification. */
  id?: string
  /** Severity; unknown values fall back to `info`. */
  level?: PluginNotificationLevel
  title: string
  summary?: string
  note?: string
  /** Auto-dismiss delay in ms; null pins the notification. Defaults to a short toast. */
  autoDismissMs?: number | null
}

/** Host notification surface; published notifications are dismissed on plugin dispose. */
export interface PluginNotifications {
  /** Publishes a notification and returns its namespaced id. */
  publish(request: PluginNotificationRequest): string
  /** Dismisses a notification by plugin-local or namespaced id. */
  dismiss(id: string): void
}

// ── Plugin context ───────────────────────────────────────────────────────────

/** The context passed to a plugin's `activate` function. */
export interface PluginContext {
  /** Registers a workbench page with the host's module registry. */
  registerPage(page: PluginPageContribution): void
  /** Design-system component subset (token-styled). */
  components: PluginComponents
  /** Allowlisted host commands; paths scoped to mod/project roots and the game directory. */
  commands: PluginCommands
  /** Built-in capability lookup by id (`plugin.id`, `plugin.targets`, `host.sdkVersion`, `host.locale`). */
  capabilities: PluginCapabilities
  /** Plugin locale lookup (bundle registered from manifest i18n). */
  i18n: PluginI18n
  /** Host notification surface (namespaced per plugin, dismissed on dispose). */
  notifications: PluginNotifications
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
