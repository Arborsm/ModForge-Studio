/**
 * @file Compat plugin runtime orchestrator: builds the full set of workbench
 * registrations (data-pack + code-pack) from the current plugin tree, owning
 * the dispose-hook lifecycle and the reload epoch. Pure with respect to the app
 * layer — it does not touch the app registry store; the caller assembles the
 * final `AppRegistry` from the returned registrations.
 *
 * Both the initial load and hot-reload funnel through {@link buildCompatPluginRuntime};
 * the difference is whether the backend is rescanned first and which epoch is
 * used to version code-package import URLs.
 * @module features/compat-plugins
 */
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import type { CodePluginLoadDiagnostic } from '../runtime/codePluginLoader'
import { disposeCodePlugins, loadCodePlugins } from '../runtime/codePluginLoader'
import { buildCompatRegistrations } from '../lib/buildCompatRegistrations'
import { registerPluginAssetSchemas } from '../lib/assetSchemaMerger'
import { registerPluginI18nBundles } from '../model/registerPluginI18nBundles'
import { registerPluginConditionSyntax } from '../model/registerPluginConditionSyntax'
import { useCompatPluginStore } from '../model/compatPluginStore'
import { listCompatPlugins, reloadCompatPluginsFromBackend } from './listCompatPlugins'
import type { CompatPluginSummary } from './types'

/** Result of building the compat plugin runtime for one load/reload cycle. */
export type CompatPluginRuntimeResult = {
  /** Plugin summaries the runtime was built from (mirrors the compat plugin store). */
  summaries: CompatPluginSummary[]
  /** Data-pack workbench module registrations. */
  registrations: WorkbenchModuleRegistration[]
  /** Code-pack workbench module registrations. */
  codeRegistrations: WorkbenchModuleRegistration[]
  /** Diagnostics from the code-package load (per-plugin failures). */
  diagnostics: CodePluginLoadDiagnostic[]
  /** Epoch used to version code-package import URLs for this cycle. */
  epoch: number
}

/** Current reload epoch; 0 for the initial load, incremented on each reload. */
let currentPluginEpoch = 0

/** Dispose hooks from the currently active code-plugin load. */
let activeDisposeHooks: (() => void)[] = []

/**
 * Monotonic build id used to guard against stale builds overwriting the
 * active dispose-hook set. Each `buildCompatPluginRuntime` call captures the
 * current id at start; after its `await loadCodePlugins` resumes, if a newer
 * build has started in the meantime, the stale build disposes its own
 * freshly-loaded hooks and skips committing state — preventing the race where
 * an initial load and a concurrent reload leave orphaned hooks that never get
 * disposed (and a registry/i18n/locale triple that is mutually inconsistent).
 */
let activeBuildId = 0

/**
 * Builds the compat plugin runtime from an already-resolved plugin list.
 * Centralizes the registration order: i18n bundles → asset schemas → code
 * plugins → condition syntax → data-pack registrations. Each registration step
 * uses whole-tree replace semantics so deleted plugins vanish and updated
 * contributions take effect immediately.
 *
 * `importEpoch` versions code-package import URLs (`undefined` for the initial
 * cold-cache load, a monotonic counter for hot-reload). `storeEpoch` is the
 * value reported back to the workbench registry store.
 *
 * Partial per-plugin failures are captured in `diagnostics` and do not abort
 * the build. Overall failures propagate to the caller, which is expected to
 * have already flipped the compat plugin store to `loading` and to catch the
 * error to mark it errored.
 *
 * Concurrency: if a newer build starts while this build is awaiting
 * `loadCodePlugins`, this build is considered stale on resume: it disposes its
 * own freshly-loaded code-plugin hooks (so they do not leak) and returns a
 * superseded result without touching the store, registry, or global
 * `activeDisposeHooks`. The caller still receives a result so its
 * status/epoch bookkeeping stays consistent, but the newest build owns the
 * committed state.
 */
async function buildCompatPluginRuntime(
  summaries: readonly CompatPluginSummary[],
  importEpoch: number | undefined,
  storeEpoch: number,
  { disposePrevious }: { disposePrevious: boolean },
): Promise<CompatPluginRuntimeResult> {
  const buildId = ++activeBuildId

  // Dispose the previously active code plugins first so their onDispose hooks
  // (notification retraction, BGM stop) run before new plugins activate. On
  // initial load there is nothing to dispose.
  if (disposePrevious) {
    disposeCodePlugins(activeDisposeHooks)
    activeDisposeHooks = []
  }

  // Disabled plugins are still listed (the compat plugin store keeps the full
  // tree so the manager can show and re-enable them) but their contributions
  // are not registered: pages do not appear in navigation, code packages are
  // not imported/activated, and asset schemas / condition syntax / i18n
  // bundles are not registered. This mirrors the backend
  // `to_attached_api_descriptors` disabled filter so attached API compatibility
  // behavior also stays disabled.
  //
  // Plugins carrying a `loadError` (manifest parse/validation failure) are
  // likewise kept in the store so the plugin manager can surface the failure,
  // but their contributions are not registered — a failed manifest has no
  // pages/schemas to register and importing its code entry could throw.
  const enabledSummaries = summaries.filter((summary) => !summary.disabled && summary.loadError === null)

  // i18n bundles must be registered before code plugins activate: the
  // PluginContext captures the plugin's bundle at activation time.
  registerPluginI18nBundles(enabledSummaries)
  registerPluginAssetSchemas(enabledSummaries)

  const codeResult = await loadCodePlugins(enabledSummaries, importEpoch)

  // Stale-build guard: a newer build started while we were awaiting. Dispose
  // the hooks we just loaded so they do not leak, and return a superseded
  // result without committing state — the newer build owns the registry/store.
  if (buildId !== activeBuildId) {
    disposeCodePlugins(codeResult.disposeHooks)
    return {
      summaries: [...summaries],
      registrations: [],
      codeRegistrations: [],
      diagnostics: codeResult.diagnostics,
      epoch: storeEpoch,
    }
  }

  activeDisposeHooks = codeResult.disposeHooks

  registerPluginConditionSyntax(enabledSummaries)
  const registrations = buildCompatRegistrations(enabledSummaries)

  const store = useCompatPluginStore.getState()
  store.setPlugins([...summaries])
  store.setDiagnostics(codeResult.diagnostics)

  return {
    summaries: [...summaries],
    registrations,
    codeRegistrations: codeResult.registrations,
    diagnostics: codeResult.diagnostics,
    epoch: storeEpoch,
  }
}

/**
 * Initial compat plugin load. Scans the backend (cached for app lifetime) and
 * builds the runtime at store epoch 0 without disposing anything. Code-package
 * imports use no version prefix (the module cache is cold).
 *
 * Flips the compat plugin store to `loading` for the whole flow and marks it
 * errored on any failure (including the backend scan) so the plugin manager can
 * surface the result.
 */
export async function loadCompatPlugins(): Promise<CompatPluginRuntimeResult> {
  useCompatPluginStore.getState().setStatus('loading')
  try {
    const summaries = await listCompatPlugins()
    return await buildCompatPluginRuntime(summaries, undefined, 0, { disposePrevious: false })
  } catch (error) {
    useCompatPluginStore.getState().setError(error instanceof Error ? error.message : String(error))
    throw error
  }
}

/**
 * Hot-reload: rescans the backend (clearing caches), increments the epoch so
 * code-package import URLs bypass the webview module cache, disposes the
 * previously active code plugins, and rebuilds the runtime.
 *
 * On overall failure the previous app registry is preserved by the caller; the
 * compat plugin store is marked errored. Per-plugin failures land in
 * `diagnostics` and do not abort the reload.
 */
export async function reloadCompatPlugins(): Promise<CompatPluginRuntimeResult> {
  useCompatPluginStore.getState().setStatus('loading')
  try {
    const summaries = await reloadCompatPluginsFromBackend()
    currentPluginEpoch += 1
    return await buildCompatPluginRuntime(summaries, currentPluginEpoch, currentPluginEpoch, { disposePrevious: true })
  } catch (error) {
    useCompatPluginStore.getState().setError(error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Resets the orchestrator's module-level state (unit tests only). */
export function __resetCompatPluginRuntimeForTests(): void {
  currentPluginEpoch = 0
  activeDisposeHooks = []
  activeBuildId = 0
}
