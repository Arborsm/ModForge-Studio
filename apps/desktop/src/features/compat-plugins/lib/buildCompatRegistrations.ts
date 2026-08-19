/**
 * @file Builds WorkbenchModuleRegistration[] from compat plugin summaries.
 * @module features/compat-plugins
 */
import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { WorkbenchModuleRegistration, WorkbenchNavigationIcon, WorkbenchNavigationSection } from '@shared/contracts'
import type { CompatPluginSummary } from '../api/types'

const VALID_SECTIONS = new Set<WorkbenchNavigationSection>(['browse', 'authoring', 'translation', 'tools', 'development'])

const VALID_ICONS = new Set<WorkbenchNavigationIcon>([
  'map',
  'events',
  'characters',
  'buildings',
  'items',
  'audio',
  'package',
  'languages',
  'files',
  'beaker',
  'book-open-check',
  'book-open',
  'dialogue',
  'schedule',
  'mail',
  'bug',
  'settings',
  'images',
])

const VALID_PRESENTATIONS = new Set(['browser', 'authoring', 'standalone'])
const VALID_PROJECT_ACCESS = new Set(['none', 'read', 'write'])

function clampSection(section: string): WorkbenchNavigationSection {
  return VALID_SECTIONS.has(section as WorkbenchNavigationSection) ? (section as WorkbenchNavigationSection) : 'tools'
}

function clampIcon(icon: string): WorkbenchNavigationIcon {
  return VALID_ICONS.has(icon as WorkbenchNavigationIcon) ? (icon as WorkbenchNavigationIcon) : 'package'
}

function clampPresentation(value: string): 'browser' | 'authoring' | 'standalone' {
  return VALID_PRESENTATIONS.has(value) ? (value as 'browser' | 'authoring' | 'standalone') : 'standalone'
}

function clampProjectAccess(value: string): 'none' | 'read' | 'write' {
  return VALID_PROJECT_ACCESS.has(value) ? (value as 'none' | 'read' | 'write') : 'none'
}

/**
 * Placeholder runtime for plugin pages. Stage 2 replaces this with the real
 * schema-rendering `CompatModuleRuntime`; stage 3 replaces it with the code
 * package's own component. In stage 1 no plugins declare pages, so this is
 * never rendered — it exists only to satisfy the `createRuntime` contract.
 */
function createPlaceholderRuntime(): LazyExoticComponent<ComponentType> {
  return lazy(() =>
    Promise.resolve({
      default: function CompatPluginPlaceholder() {
        return null
      },
    }),
  )
}

/**
 * Converts compat plugin summaries into WorkbenchModuleRegistration entries.
 *
 * - Plugin module ids are prefixed with `compat-` to avoid collisions with
 *   built-in modules.
 * - Sections outside the valid set are clamped to `tools`.
 * - Browser + write project access is rejected by `validateWorkbenchModules`.
 * - Duplicate ids are rejected by `validateWorkbenchModules`.
 */
export function buildCompatRegistrations(plugins: readonly CompatPluginSummary[]): WorkbenchModuleRegistration[] {
  const registrations: WorkbenchModuleRegistration[] = []
  for (const plugin of plugins) {
    for (const page of plugin.pages) {
      const moduleId = `compat-${plugin.id}:${page.id}`
      registrations.push({
        id: moduleId,
        navigation: {
          section: clampSection(page.section),
          order: page.order,
          icon: clampIcon(page.icon),
          pluginLabel: { pluginId: plugin.id, key: page.titleKey },
        },
        presentation: clampPresentation(page.presentation),
        projectAccess: clampProjectAccess(page.projectAccess),
        createRuntime: createPlaceholderRuntime,
        persistenceKey: moduleId,
      })
    }
  }
  return registrations
}

/** Re-exported for unit tests. */
export { VALID_SECTIONS, VALID_ICONS }
