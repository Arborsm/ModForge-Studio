/**
 * @file Launcher context menu item component.
 */
import * as ContextMenu from '@radix-ui/react-context-menu'

/** Launcher context menu action definition. */
export type LauncherContextMenuAction = {
  label: string
  onSelect: () => void
}

/** Launcher context menu item component. */
export function LauncherContextMenuItem({ action }: { action: LauncherContextMenuAction }) {
  const runAction = () => {
    action.onSelect()
  }

  return (
    <ContextMenu.Item className="context-menu-item" onSelect={runAction}>
      {action.label}
    </ContextMenu.Item>
  )
}
