import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { LauncherLibraryDndScope } from '@pages/launcher/library/ui/LauncherLibraryDndScope'

const { dndContextMock, setActivatorNodeRefMock, setDraggableNodeRefMock, setDroppableNodeRefMock } = vi.hoisted(() => ({
  dndContextMock: vi.fn(),
  setActivatorNodeRefMock: vi.fn(),
  setDraggableNodeRefMock: vi.fn(),
  setDroppableNodeRefMock: vi.fn(),
}))

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: (props: { children: ReactNode }) => {
      dndContextMock(props)
      return <div data-testid="dnd-context">{props.children}</div>
    },
    DragOverlay: ({ children }: { children: ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({
      listeners: {},
      setActivatorNodeRef: setActivatorNodeRefMock,
      setNodeRef: setDraggableNodeRefMock,
    }),
    useDroppable: () => ({
      setNodeRef: setDroppableNodeRefMock,
    }),
  }
})

describe('LauncherLibraryDndScope', () => {
  it('disables dnd-kit auto scrolling so drag previews cannot horizontally scroll launcher containers', () => {
    render(
      <LauncherLibraryDndScope
        resolveDraggedModIds={(modId) => [modId]}
        onAddModsToPack={vi.fn()}
        onAssignModsToLibraryFolder={vi.fn()}
        onRemoveChildModsFromParent={vi.fn()}
        onRemoveModsFromLibraryFolders={vi.fn()}
        onReleaseModsFromLibraryFolder={vi.fn()}
        onMoveFolderToFolder={vi.fn()}
        onReorderRoot={vi.fn()}
        onReorderFolder={vi.fn()}
        onReorderChildMod={vi.fn()}
      >
        <div />
      </LauncherLibraryDndScope>,
    )

    expect(dndContextMock).toHaveBeenCalledWith(expect.objectContaining({ autoScroll: false }))
  })
})
