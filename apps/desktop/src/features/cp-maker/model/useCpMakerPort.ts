import { useContext } from 'react'
import { CpMakerPortContext } from './cpMakerPortContext'
import type { CpMakerPort } from './cpMakerPort'

export function useCpMakerPort(): CpMakerPort {
  const port = useContext(CpMakerPortContext)

  if (!port) {
    throw new Error(
      'useCpMakerPort must be used within a CpMakerProvider. ' +
        'Ensure the app-level provider is mounted above the workbench shell.',
    )
  }

  return port
}
