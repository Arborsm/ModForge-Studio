import type { ReactNode } from 'react'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { ContentPatcherNavigator } from './ContentPatcherNavigator'

vi.mock('@radix-ui/react-context-menu', () => ({
  Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Sub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SubTrigger: ({ children, className }: { children: ReactNode, className?: string }) => (
    <button type="button" className={className}>{children}</button>
  ),
  SubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Item: ({
    children,
    className,
    onSelect,
  }: {
    children: ReactNode
    className?: string
    onSelect?: () => void
  }) => (
    <button type="button" className={className} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('ContentPatcherNavigator', () => {
  it('opens the ScaleUp submenu for image targets and routes preview/settings actions', async () => {
    const onOpenScaleUp = vi.fn()
    const props: any = {
      mode: 'targets',
      onModeChange: vi.fn(),
      patches: [],
      patchStatuses: [],
      targets: [
        {
          path: 'Characters/Lewis',
          assetKind: 'image',
          touchedPatchCount: 1,
          resultState: 'determinate',
          patchIds: ['content.json:0'],
        },
      ],
      selectedPatchId: null,
      selectedTargetPath: 'Characters/Lewis',
      onSelectPatch: vi.fn(),
      onSelectTarget: vi.fn(),
      onOpenScaleUp,
    }

    renderWithLocale(<ContentPatcherNavigator {...props} />)

    fireEvent.click(screen.getByText('ScaleUp'))
    fireEvent.click(screen.getByText('Render Preview'))
    fireEvent.click(screen.getByText('Parameter Settings'))

    expect(onOpenScaleUp).toHaveBeenNthCalledWith(1, 'Characters/Lewis', 'preview')
    expect(onOpenScaleUp).toHaveBeenNthCalledWith(2, 'Characters/Lewis', 'settings')
  })

  it('does not expose ScaleUp actions for non-image targets', async () => {
    const props: any = {
      mode: 'targets',
      onModeChange: vi.fn(),
      patches: [],
      patchStatuses: [],
      targets: [
        {
          path: 'Data/Objects',
          assetKind: 'json',
          touchedPatchCount: 1,
          resultState: 'determinate',
          patchIds: ['content.json:0'],
        },
      ],
      selectedPatchId: null,
      selectedTargetPath: 'Data/Objects',
      onSelectPatch: vi.fn(),
      onSelectTarget: vi.fn(),
      onOpenScaleUp: vi.fn(),
    }

    renderWithLocale(<ContentPatcherNavigator {...props} />)

    expect(screen.queryByText('ScaleUp')).toBeNull()
  })
})
