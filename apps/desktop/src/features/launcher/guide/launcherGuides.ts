import type { GuideDefinition } from '@shared/contracts'

/**
 * Launcher functional-area guides (registration objects). Pages only render the
 * referenced `data-guide-surface` / `data-guide` attributes; they never import
 * guide code, and this file never imports page code.
 */
export const launcherGuideDefinitions: GuideDefinition[] = [
  {
    id: 'launcher-library',
    surface: 'launcher.library',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'nav-tabs', anchor: 'launcher-nav-tabs', placement: 'bottom' },
      { id: 'library-toolbar', anchor: 'launcher-library-toolbar', placement: 'bottom' },
      { id: 'pack-sidebar', anchor: 'launcher-pack-sidebar', placement: 'right' },
      { id: 'mod-grid', anchor: 'launcher-mod-grid', placement: 'top' },
      { id: 'mod-detail', anchor: 'launcher-mod-detail', placement: 'left' },
    ],
  },
  {
    id: 'launcher-discover',
    surface: 'launcher.discover',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'discover-search', anchor: 'launcher-discover-search', placement: 'bottom' },
      { id: 'discover-toolbar', anchor: 'launcher-discover-toolbar', placement: 'bottom' },
      { id: 'discover-results', anchor: 'launcher-discover-results', placement: 'top' },
    ],
  },
  {
    id: 'launcher-updates',
    surface: 'launcher.updates',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'updates-check', anchor: 'launcher-updates-check', placement: 'bottom' },
      { id: 'updates-list', anchor: 'launcher-updates-list', placement: 'top' },
    ],
  },
  {
    id: 'launcher-configuration',
    surface: 'launcher.configuration',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'config-game', anchor: 'launcher-config-game', placement: 'bottom' },
      { id: 'config-nexus', anchor: 'launcher-config-nexus', placement: 'bottom' },
      { id: 'config-diagnostics', anchor: 'launcher-config-diagnostics', placement: 'top' },
    ],
  },
]
