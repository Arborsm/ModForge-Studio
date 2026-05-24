import { useRef } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'

export type LauncherContextMenuAction = {
  label: string
  onSelect: () => void
}

export function LauncherContextMenuItem({ action }: { action: LauncherContextMenuAction }) {
  const handledRef = useRef(false)
  const runAction = () => {
    if (handledRef.current) {
      return
    }
    handledRef.current = true
    action.onSelect()
    window.setTimeout(() => {
      handledRef.current = false
    }, 250)
  }

  return (
    <ContextMenu.Item asChild onSelect={(event) => event.preventDefault()}>
      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onPointerDown={runAction}
        onPointerUp={runAction}
        onClick={runAction}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            runAction()
          }
        }}
      >
        {action.label}
      </button>
    </ContextMenu.Item>
  )
}
