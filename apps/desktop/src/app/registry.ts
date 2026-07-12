import type { AppRegistry, AppRegistryInput, RegistryItemId, WorkbenchModuleRegistration } from '@shared/contracts'

const NAVIGATION_SECTIONS = new Set(['browse', 'authoring', 'tools', 'development'])

function validateWorkbenchModules(modules: readonly WorkbenchModuleRegistration[]) {
  const ids = new Set<string>()
  const persistenceKeys = new Set<string>()
  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Duplicate workbench module id: ${module.id}`)
    if (persistenceKeys.has(module.persistenceKey)) throw new Error(`Duplicate workbench persistenceKey: ${module.persistenceKey}`)
    if (!NAVIGATION_SECTIONS.has(module.navigation.section)) {
      throw new Error(`Unknown workbench navigation section: ${module.navigation.section}`)
    }
    if (module.presentation === 'browser' && module.projectAccess === 'write') {
      throw new Error(`Browser module cannot request write project access: ${module.id}`)
    }
    ids.add(module.id)
    persistenceKeys.add(module.persistenceKey)
  }
}

/** Creates an immutable application registry after validating Workbench invariants. */
export function createAppRegistry(input: AppRegistryInput = {}): AppRegistry {
  const workbenchModules = [...(input.workbenchModules ?? [])]
  validateWorkbenchModules(workbenchModules)
  return { pages: [...(input.pages ?? [])], workbenchModules }
}

/** Resolves one Workbench module registration from a concrete registry. */
export function getWorkbenchModuleRegistration(registry: AppRegistry, moduleId: RegistryItemId): WorkbenchModuleRegistration | null {
  return registry.workbenchModules.find((module) => module.id === moduleId) ?? null
}
