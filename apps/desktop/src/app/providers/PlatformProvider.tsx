import { useMemo, type ReactNode } from 'react'
import { createTauriPlatformPorts } from '@platform/tauri'
import type { PlatformPorts } from '@shared/contracts'
import { PlatformContext } from './platformContext'

export type PlatformProviderProps = {
  children: ReactNode
  ports?: PlatformPorts
}

export function PlatformProvider({ children, ports }: PlatformProviderProps) {
  const defaultPorts = useMemo(() => ports ?? createTauriPlatformPorts(), [ports])

  return <PlatformContext.Provider value={defaultPorts}>{children}</PlatformContext.Provider>
}
