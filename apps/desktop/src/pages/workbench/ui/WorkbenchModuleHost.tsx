import type { WorkbenchModuleRegistration } from '@shared/contracts'
import type { UseCpMakerReturn } from '@features/cp-maker'
import {
  WorkbenchEnvironmentProvider,
  WorkbenchModuleAccessProvider,
  WorkbenchModuleStateProvider,
  WorkbenchProjectProvider,
  type WorkbenchEnvironment,
  type WorkbenchModuleState,
} from '../model/workbenchModuleContexts'
import { WorkbenchViewHost } from './WorkbenchViewHost'

type WorkbenchModuleHostProps = {
  module: WorkbenchModuleRegistration | null
  environment: WorkbenchEnvironment
  project: UseCpMakerReturn
  moduleState: WorkbenchModuleState
}

/** Provides the scoped runtime ports required by one registered workbench module. */
export function WorkbenchModuleHost({ module, environment, project, moduleState }: WorkbenchModuleHostProps) {
  const access = module
    ? { id: module.id, presentation: module.presentation, projectAccess: module.projectAccess }
    : { id: '', presentation: 'standalone' as const, projectAccess: 'none' as const }
  return (
    <WorkbenchEnvironmentProvider value={environment}>
      <WorkbenchProjectProvider value={module?.presentation === 'authoring' ? project : null}>
        <WorkbenchModuleAccessProvider value={access}>
          <WorkbenchModuleStateProvider value={moduleState}>
            <WorkbenchViewHost module={module} />
          </WorkbenchModuleStateProvider>
        </WorkbenchModuleAccessProvider>
      </WorkbenchProjectProvider>
    </WorkbenchEnvironmentProvider>
  )
}
