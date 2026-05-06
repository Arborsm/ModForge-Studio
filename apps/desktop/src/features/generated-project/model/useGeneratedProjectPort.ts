import { useContext } from 'react'
import { GeneratedProjectPortContext } from './generatedProjectPortContext'
import type { GeneratedProjectPort } from './generatedProjectPort'

export function useGeneratedProjectPort(): GeneratedProjectPort {
  const port = useContext(GeneratedProjectPortContext)

  if (!port) {
    throw new Error(
      'useGeneratedProjectPort must be used within a GeneratedProjectProvider. ' +
        'Ensure the app-level provider is mounted above the workbench shell.',
    )
  }

  return port
}
