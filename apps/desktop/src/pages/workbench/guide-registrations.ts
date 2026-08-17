import type { GuideDefinition } from '@shared/contracts'

/**
 * Workbench functional-area guides (registration objects). Kept free of any
 * component imports so `app/guide-setup.ts` can compose them eagerly.
 */
export const workbenchGuideDefinitions: GuideDefinition[] = [
  {
    id: 'workbench-home',
    surface: 'workbench.home',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'workbench-nav', anchor: 'workbench-nav', placement: 'right' },
      { id: 'workbench-modules', anchor: 'workbench-modules', placement: 'left' },
    ],
  },
  {
    id: 'workbench-translation',
    surface: 'workbench.translation',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'translation-views', anchor: 'translation-views', placement: 'bottom' },
      { id: 'translation-knowledge', anchor: 'translation-knowledge', placement: 'top' },
    ],
  },
  {
    id: 'workbench-map',
    surface: 'workbench.map',
    steps: [
      { id: 'welcome', placement: 'center' },
      { id: 'map-catalog-card', anchor: 'map-catalog-card', placement: 'top' },
      { id: 'map-layer-list', anchor: 'map-layer-list', placement: 'right' },
      { id: 'map-tileset-palette', anchor: 'map-tileset-palette', placement: 'top' },
      { id: 'map-canvas', anchor: 'map-canvas', placement: 'bottom' },
      { id: 'map-inspector-map', anchor: 'map-inspector-map', placement: 'left' },
      { id: 'map-save-button', anchor: 'map-save-button', placement: 'bottom' },
    ],
  },
]
