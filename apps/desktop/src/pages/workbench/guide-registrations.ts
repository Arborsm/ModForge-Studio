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
]
