import { type ReactNode } from 'react'
import { createGeneratedProjectPortAdapter } from './generatedProjectPortAdapter'
import { GeneratedProjectProvider } from '@features/generated-project'

export type GeneratedProjectPlatformProviderProps = {
  children: ReactNode
}

export function GeneratedProjectPlatformProvider({ children }: GeneratedProjectPlatformProviderProps) {
  const port = createGeneratedProjectPortAdapter()

  return <GeneratedProjectProvider port={port}>{children}</GeneratedProjectProvider>
}
