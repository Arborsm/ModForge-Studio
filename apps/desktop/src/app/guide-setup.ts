/**
 * @file Static composition point for the app guide tour: aggregates guide definitions from each feature area and resolves guide surfaces to navigation actions.
 */
import { launcherGuideDefinitions } from '@features/launcher/guide'
import { workbenchGuideDefinitions } from '@pages/workbench/guide-registrations'
import type { GuideDefinition } from '@shared/contracts'
import type { AppMode, LauncherPage } from '@locales/api'

/** Static aggregation of guide definitions from all app feature areas. */
export const appGuideDefinitions: GuideDefinition[] = [...launcherGuideDefinitions, ...workbenchGuideDefinitions]

const LAUNCHER_GUIDE_PAGES = new Set<LauncherPage>(['library', 'discover', 'updates', 'configuration'])

/** Shell navigation info required after resolving a guide surface. */
export type GuideSurfaceNavigation = {
  appMode: AppMode
  launcherPage?: LauncherPage
}

/**
 * Maps a guide surface to the shell navigation needed to reveal it. Workbench
 * sub-surfaces rely on the workbench restoring its own last location.
 */
export function resolveGuideSurfaceNavigation(surface: string): GuideSurfaceNavigation | null {
  if (surface.startsWith('launcher.')) {
    const page = surface.slice('launcher.'.length) as LauncherPage
    return LAUNCHER_GUIDE_PAGES.has(page) ? { appMode: 'launcher', launcherPage: page } : null
  }

  if (surface.startsWith('workbench.')) {
    return { appMode: 'workbench' }
  }

  return null
}
