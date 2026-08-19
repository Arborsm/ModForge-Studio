/**
 * @file Builds WorkbenchModuleRegistration[] from compat plugin summaries.
 * @module features/compat-plugins
 */
import { createElement, lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { WorkbenchModuleRegistration, WorkbenchNavigationIcon, WorkbenchNavigationSection } from '@shared/contracts'
import type { CompatPluginSummary } from '../api/types'
import { usePageDescriptorStore } from '../model/pageDescriptorStore'

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

export function clampSection(section: string): WorkbenchNavigationSection {
  return VALID_SECTIONS.has(section as WorkbenchNavigationSection) ? (section as WorkbenchNavigationSection) : 'tools'
}

export function clampIcon(icon: string): WorkbenchNavigationIcon {
  return VALID_ICONS.has(icon as WorkbenchNavigationIcon) ? (icon as WorkbenchNavigationIcon) : 'package'
}

export function clampPresentation(value: string): 'browser' | 'authoring' | 'standalone' {
  return VALID_PRESENTATIONS.has(value) ? (value as 'browser' | 'authoring' | 'standalone') : 'standalone'
}

export function clampProjectAccess(value: string): 'none' | 'read' | 'write' {
  return VALID_PROJECT_ACCESS.has(value) ? (value as 'none' | 'read' | 'write') : 'none'
}

/**
 * Creates the lazy runtime for a compat plugin page. The runtime is the
 * schema-rendering `CompatModuleRuntime` for data-pack pages (stage 2); stage 3
 * will replace this with the code package's own component for code-entry pages.
 * The runtime receives the module id via a closure wrapper since
 * `WorkbenchViewHost` calls `createRuntime()` without passing props.
 */
function createCompatRuntime(moduleId: string): LazyExoticComponent<ComponentType> {
  return lazy(() =>
    import('../runtime/CompatModuleRuntime').then((module) => ({
      default: function CompatRuntimeBound() {
        return createElement(module.CompatModuleRuntime, { moduleId })
      },
    })),
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
  // Register page descriptors so the runtime can look them up by module id.
  const descriptorStore = usePageDescriptorStore.getState()
  for (const plugin of plugins) {
    descriptorStore.registerPages(plugin.id, plugin.pages, plugin.targets)
  }

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
        createRuntime: () => createCompatRuntime(moduleId),
        persistenceKey: moduleId,
      })
    }
  }
  return registrations
}

/** Re-exported for unit tests. */
export { VALID_SECTIONS, VALID_ICONS }
