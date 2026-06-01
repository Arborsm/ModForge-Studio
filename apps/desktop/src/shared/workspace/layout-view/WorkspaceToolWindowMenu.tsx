import * as ContextMenu from '@radix-ui/react-context-menu'
import { PanelBottom, PanelLeft, PanelRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DockArea } from '@shared/contracts'

const DOCK_TARGETS: Array<{ area: DockArea; label: string; icon: LucideIcon }> = [
  { area: 'left-top', label: 'Move to Left Top', icon: PanelLeft },
  { area: 'left-bottom', label: 'Move to Left Bottom', icon: PanelLeft },
  { area: 'right-top', label: 'Move to Right Top', icon: PanelRight },
  { area: 'right-bottom', label: 'Move to Right Bottom', icon: PanelRight },
  { area: 'bottom-left', label: 'Move to Bottom Left', icon: PanelBottom },
  { area: 'bottom-right', label: 'Move to Bottom Right', icon: PanelBottom },
]

export function ToolWindowMenu({
  children,
  onFloat,
  onHide,
  onDock,
}: {
  children: ReactNode
  onFloat: () => void
  onHide: () => void
  onDock: (area: DockArea) => void
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content">
          <ContextMenu.Item className="context-menu-item" onSelect={onFloat}>
            Float Window
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onHide}>
            Hide
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color-mix(in_srgb,var(--border-color)_75%,transparent)]" />
          {DOCK_TARGETS.map((target) => (
            <ContextMenu.Item
              key={target.area}
              className="context-menu-item flex items-center justify-between gap-3"
              onSelect={() => onDock(target.area)}
            >
              <span>{target.label}</span>
              <target.icon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
