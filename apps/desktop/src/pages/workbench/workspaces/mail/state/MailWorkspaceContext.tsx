import { createContext, useContext, type ReactNode } from 'react'
import type { UseMailWorkspaceReturn } from './useMailWorkspace'

const MailWorkspaceContext = createContext<UseMailWorkspaceReturn | null>(null)

/** Shares the mail workspace state with the mail view tree without prop drilling. */
export function MailWorkspaceProvider({ value, children }: { value: UseMailWorkspaceReturn; children: ReactNode }) {
  return <MailWorkspaceContext value={value}>{children}</MailWorkspaceContext>
}

/** Returns the mail workspace state provided by `MailWorkspaceProvider`. */
export function useMailWorkspaceContext(): UseMailWorkspaceReturn {
  const value = useContext(MailWorkspaceContext)
  if (!value) {
    throw new Error('useMailWorkspaceContext must be used within MailWorkspaceProvider')
  }
  return value
}
