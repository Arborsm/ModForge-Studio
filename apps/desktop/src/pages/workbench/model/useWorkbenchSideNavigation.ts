import { useCallback, useRef, useState } from 'react'
import { getAppUiStateSnapshot } from '@shared/lib/app-state'

/** Owns user interaction state for the registry-driven Workbench side navigation. */
export function useWorkbenchSideNavigation() {
  const persisted = getAppUiStateSnapshot().workspace.navigation
  const interactedRef = useRef(false)
  const [collapsed, setCollapsed] = useState(persisted.collapsed)
  const [sections, setSections] = useState({
    browseOpen: persisted.expandedSections.includes('browse'),
    authoringOpen: persisted.expandedSections.includes('authoring'),
    toolsOpen: persisted.expandedSections.includes('tools'),
    devOpen: persisted.expandedSections.includes('development'),
  })

  const changeCollapsed = useCallback((next: boolean) => {
    interactedRef.current = true
    setCollapsed(next)
  }, [])
  const changeSections = useCallback((next: typeof sections) => {
    interactedRef.current = true
    setSections(next)
  }, [])

  return { collapsed, sections, interactedRef, setCollapsed, setSections, changeCollapsed, changeSections }
}
