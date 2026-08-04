import type { LocaleCode } from '@locales/api'
import { loadResourceRegistry } from '@entities/game/api'
import { loadItemWorkspaceEntries } from '@entities/item'

/**
 * Pre-warms the shared caches the event editor mounts with (global resource
 * registry + item catalog). Both loaders are promise-cached app-wide, so this
 * dedupes with the editor's own loads: callers may fire-and-forget (hub visit)
 * or await (editor entry gate). Failures resolve to null — the editor's own
 * load effects surface real errors.
 */
export function warmEventEditorResources(gameRootPath: string, locale: LocaleCode): Promise<unknown[]> {
  return Promise.all([
    loadResourceRegistry(gameRootPath, locale).catch(() => null),
    loadItemWorkspaceEntries(gameRootPath, locale).catch(() => null),
  ])
}
