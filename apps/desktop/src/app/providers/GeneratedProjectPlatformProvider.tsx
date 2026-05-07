import { type ReactNode, useMemo } from 'react'
import { createGeneratedProjectPortAdapter } from './generatedProjectPortAdapter'
import { GeneratedProjectProvider } from '@features/generated-project'
import { usePlatformPorts } from './usePlatformPorts'

export type GeneratedProjectPlatformProviderProps = {
  children: ReactNode
}

export function GeneratedProjectPlatformProvider({ children }: GeneratedProjectPlatformProviderProps) {
  const platformPorts = usePlatformPorts()
  const port = useMemo(() => createGeneratedProjectPortAdapter(platformPorts), [platformPorts])

  return <GeneratedProjectProvider port={port}>{children}</GeneratedProjectProvider>
}
