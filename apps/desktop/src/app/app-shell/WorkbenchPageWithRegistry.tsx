/**
 * @file Workbench page wrapper that sources the active registry from the
 * workbench registry store instead of a closure-captured snapshot, so
 * compat-plugin hot-reload swaps the module set in place without remounting
 * the workbench shell.
 * @module app/app-shell
 */
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { WorkbenchShellSkeleton } from '@shared/ui/WorkbenchShellSkeleton'
import { WorkbenchPage } from '@pages/workbench'
import { CpMakerPlatformProvider } from '../providers/CpMakerPlatformProvider'
import { getWorkbenchModuleRegistration } from '../registry'
import { useWorkbenchRegistryStore } from '../workbenchRegistryStore'

type WorkbenchPageWithRegistryProps = Omit<Parameters<typeof WorkbenchPage>[0], 'getWorkbenchModuleRegistration' | 'workbenchModules'>

/** Renders the workbench page against the current registry snapshot from the store. */
export function WorkbenchPageWithRegistry(props: WorkbenchPageWithRegistryProps) {
  const registry = useWorkbenchRegistryStore((state) => state.registry)

  if (!registry) {
    return <WorkbenchShellSkeleton />
  }

  const getRegistration = (moduleId: string): WorkbenchModuleRegistration | null => getWorkbenchModuleRegistration(registry, moduleId)

  return (
    <CpMakerPlatformProvider>
      <WorkbenchPage {...props} getWorkbenchModuleRegistration={getRegistration} workbenchModules={registry.workbenchModules} />
    </CpMakerPlatformProvider>
  )
}
