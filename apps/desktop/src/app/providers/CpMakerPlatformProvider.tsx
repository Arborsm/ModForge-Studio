import { type ReactNode, useMemo } from 'react'
import { createCpMakerPortAdapter } from './cpMakerPortAdapter'
import { CpMakerProvider } from '@features/cp-maker'
import { usePlatformPorts } from './usePlatformPorts'

export type CpMakerPlatformProviderProps = {
  children: ReactNode
}

export function CpMakerPlatformProvider({ children }: CpMakerPlatformProviderProps) {
  const platformPorts = usePlatformPorts()
  const port = useMemo(() => createCpMakerPortAdapter(platformPorts), [platformPorts])

  return <CpMakerProvider port={port}>{children}</CpMakerProvider>
}
