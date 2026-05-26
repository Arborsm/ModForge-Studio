import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkbenchExperience from './WorkbenchExperience'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import type { WorkbenchViewRegistration } from '@shared/contracts'

const applyAppUiStatePatchSpy = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@shared/lib/app-state', async () => {
  const actual = await vi.importActual<typeof import('@shared/lib/app-state')>('@shared/lib/app-state')
  return {
    ...actual,
    getAppUiStateSnapshot: vi.fn(() => ({
      workspace: {
        workspaceViewMode: 'edit',
        layouts: {},
        cpMaker: {
          activeGeneratedDraftKey: null,
        },
      },
      appearance: {
        recentGameDirectories: [],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
    })),
    applyAppUiStatePatch: applyAppUiStatePatchSpy,
  }
})

const loadDraftSpy = vi.fn()
const useCpMakerState = vi.hoisted(() => ({
  drafts: [] as Array<{
    draftStorageKey: string
    projectName: string
    projectUniqueId: string
    lastDraftSavedAt: number | null
    lastExportedAt: number | null
  }>,
}))

vi.mock('@features/cp-maker', async () => {
  const actual = await vi.importActual<typeof import('@features/cp-maker')>('@features/cp-maker')
  return {
    ...actual,
    useCpMaker: () => ({
      activeDraft: null,
      drafts: useCpMakerState.drafts,
      patchCountByWorkspace: {},
      dirtyPatchIds: new Set<string>(),
      isDirty: false,
      loadDraft: loadDraftSpy,
    }),
  }
})

function viewRegistration(title: string): WorkbenchViewRegistration {
  return {
    id: title,
    kind: 'workbench-view',
    viewId: title,
    title,
    component: () => <div>{title}</div>,
  }
}

function renderExperience() {
  return renderWithLocale(
    <WorkbenchExperience
      pendingWorkbenchIntent={null}
      onClearPendingIntent={vi.fn()}
      active
      appUiStateReady
      theme="light"
      locale="en-US"
      accentColor="#2278f2"
      desktopHost={false}
      onToggleTheme={vi.fn()}
      onSwitchToLauncher={vi.fn()}
      onOpenSettings={vi.fn()}
      onMinimizeWindow={vi.fn()}
      onToggleMaximizeWindow={vi.fn()}
      onCloseWindow={vi.fn()}
      onWorkbenchEvent={vi.fn()}
      getWorkbenchViewRegistration={(viewId) => viewRegistration(viewId)}
    />,
  )
}

describe('WorkbenchExperience launchpad navigation', () => {
  it('opens the launchpad by default without restoring the previous workspace page', () => {
    renderExperience()

    expect(screen.getByRole('dialog', { name: 'Choose a workbench page' })).toBeTruthy()
    expect(screen.queryByText('Viewport')).toBeNull()
  })

  it('opens initialization while no game directory is available', () => {
    renderExperience()

    expect(screen.getByRole('dialog', { name: 'Choose a workbench page' })).toBeTruthy()
    expect(screen.getAllByText('Game directory').length).toBeGreaterThan(0)
  })

  it('opens root browse pages in preview mode from the launchpad', async () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Choose a workbench page' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose a workbench page' })).toBeNull()
    })
    expect(screen.getByText('Viewport')).toBeTruthy()
    expect(screen.queryByText('studio-desk')).toBeNull()
  })

  it('opens project management from the dock project shortcut', () => {
    renderExperience()

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose a workbench page' })).getByRole('button', { name: 'Map' }))
    expect(screen.getByText('Viewport')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Project Manager' }))

    expect(screen.getByText('studio-desk')).toBeTruthy()
  })

  it('keeps launchpad making entries clickable when no project is active', () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Choose a workbench page' })

    expect(within(dialog).getByRole('button', { name: 'Map Making' })).not.toBeDisabled()
  })

  it('loads a selected project before entering making pages', () => {
    useCpMakerState.drafts = [
      {
        draftStorageKey: 'festival-dialogue',
        projectName: 'Festival Dialogue Pack',
        projectUniqueId: 'Author.FestivalDialogue',
        lastDraftSavedAt: null,
        lastExportedAt: null,
      },
    ]
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Choose a workbench page' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Making' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Choose Current Project' })).getByRole('button', { name: 'Festival Dialogue Pack' }),
    )

    expect(loadDraftSpy).toHaveBeenCalledWith('festival-dialogue')
    useCpMakerState.drafts = []
  })

  it('does not persist workspace view mode while navigating launchpad pages', () => {
    renderExperience()

    const dialog = screen.getByRole('dialog', { name: 'Choose a workbench page' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map' }))

    expect(applyAppUiStatePatchSpy).not.toHaveBeenCalledWith({
      workspace: {
        workspaceViewMode: 'preview',
      },
    })
  })
})
