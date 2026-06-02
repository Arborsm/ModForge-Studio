import { useMemo, type ReactNode } from 'react'
import { createElectronPlatformPorts, isElectronHost } from '@platform/electron'
import { createTauriPlatformPorts } from '@platform/tauri'
import type { PlatformPorts } from '@shared/contracts'
import { configureDesktopPlatformPorts } from '@shared/lib/desktop'
import { PlatformContext } from './platformContext'

export type PlatformProviderProps = {
  children: ReactNode
  ports?: PlatformPorts
}

export function PlatformProvider({ children, ports }: PlatformProviderProps) {
  const defaultPorts = useMemo(() => ports ?? (isElectronHost() ? createElectronPlatformPorts() : createTauriPlatformPorts()), [ports])
  configureDesktopPlatformPorts(defaultPorts)

  return <PlatformContext.Provider value={defaultPorts}>{children}</PlatformContext.Provider>
}
