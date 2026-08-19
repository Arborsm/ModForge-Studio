/**
 * @file Hook that reads the active CpMakerPort from context, throwing when no
 * provider is mounted.
 * @module features/cp-maker
 */
import { useContext } from 'react'
import { CpMakerPortContext } from './cpMakerPortContext'
import type { CpMakerPort } from './cpMakerPort'

/** Returns the active CpMakerPort from context; throws when no provider is mounted. */
export function useCpMakerPort(): CpMakerPort {
  const port = useContext(CpMakerPortContext)

  if (!port) {
    throw new Error(
      'useCpMakerPort must be used within a CpMakerProvider. ' + 'Ensure the app-level provider is mounted above the workbench shell.',
    )
  }

  return port
}
