import * as ContextMenu from '@radix-ui/react-context-menu'

export type LauncherContextMenuAction = {
  label: string
  onSelect: () => void
}

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
