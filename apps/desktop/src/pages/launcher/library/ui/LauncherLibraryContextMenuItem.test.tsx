import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { LauncherContextMenuItem } from './LauncherLibraryContextMenuItem'

vi.mock('@radix-ui/react-context-menu', () => ({
  Item: ({ children, className, onSelect }: { children: ReactNode; className?: string; onSelect?: () => void }) => (
    <button type="button" role="menuitem" className={className} onClick={onSelect}>
      {children}
    </button>
  ),
}))

describe('LauncherContextMenuItem', () => {
  it('runs the action once through the menu select event', () => {
    const onSelect = vi.fn()
    render(<LauncherContextMenuItem action={{ label: 'Open Folder', onSelect }} />)

    const item = screen.getByRole('menuitem', { name: 'Open Folder' })
    fireEvent.pointerDown(item)
    fireEvent.pointerUp(item)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
