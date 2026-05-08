import { createContext } from 'react'
import type { PlatformPorts } from '@shared/contracts'

export const PlatformContext = createContext<PlatformPorts | null>(null)
