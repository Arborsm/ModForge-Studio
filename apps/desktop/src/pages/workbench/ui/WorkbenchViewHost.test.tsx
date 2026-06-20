import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import { renderWithLocale } from '@test/renderWithLocale'
import { WorkbenchViewHost } from './WorkbenchViewHost'

function renderHost(editModeView: WorkbenchViewRegistration, overrides: Partial<Parameters<typeof WorkbenchViewHost>[0]> = {}) {
  const cpMaker = {
    activeDraft: null,
    drafts: [],
    createDraft: vi.fn(),
    addPatch: vi.fn(),
    loadDraft: vi.fn(),
    chooseDirectory: vi.fn(),
    importPack: vi.fn(),
    copyDraft: vi.fn(),
    deleteDraft: vi.fn(),
  } as never
  const onRunWithCpMakerUnsavedGuard = vi.fn(async (action: () => void | Promise<void>) => {
    await action()
    return true
  })

  return renderWithLocale(
    <WorkbenchViewHost
      editModeView={editModeView}
      workspaceMode="map"
      locale="en-US"
      theme="dark"
      accentColor="#22c55e"
      directoryInfo={null}
      canGoBack={false}
      canGoForward={false}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      cpMaker={cpMaker}
      studioDeskModel={{} as never}
      onWorkbenchEvent={vi.fn()}
      navigateToPatch={vi.fn()}
      onSetWorkspaceMode={vi.fn()}
      onRunWithModUnsavedGuard={async (action) => {
        await action()
        return true
      }}
      onRunWithCpMakerUnsavedGuard={onRunWithCpMakerUnsavedGuard}
      onSetWorkspaceViewMode={vi.fn()}
      studioDeskGalleryOpen={false}
      onStudioDeskGalleryOpenChange={vi.fn()}
      studioDeskCreateDialogOpenSignal={0}
      activeEditPatchId={null}
      {...overrides}
    />,
  )
}

describe('WorkbenchViewHost', () => {
  it('wraps the studio desk edit page with loading reveal hooks', () => {
    renderHost({
      id: 'studio-desk',
      kind: 'workbench-view',
      viewId: 'studio-desk',
      title: 'Studio Desk',
      component: () => <div>Studio desk body</div>,
    })

    expect(screen.getByText('Studio desk body').closest('[data-loading-section]')).toHaveAttribute(
      'data-loading-section',
      'workbench-edit-studio-desk',
    )
  })

  it('wraps the workspace editor edit page with mode-specific loading reveal hooks', () => {
    renderHost({
      id: 'workspace-editor',
      kind: 'workbench-view',
      viewId: 'workspace-editor',
      title: 'Workspace Editor',
      component: () => <div>Workspace editor body</div>,
    })

    expect(screen.getByText('Workspace editor body').closest('[data-loading-section]')).toHaveAttribute(
      'data-loading-section',
      'workbench-edit-workspace-editor:map',
    )
  })

  it('runs studio desk draft replacement actions through the CP Maker unsaved guard', () => {
    const createDraft = vi.fn()
    const onRunWithCpMakerUnsavedGuard = vi.fn(async (action: () => void | Promise<void>) => {
      await action()
      return true
    })

    function StudioDeskStub(props: {
      onCreateDraft: (metadata: {
        projectName: string
        projectDescription: string
        projectAuthor: string
        projectVersion: string
        projectUniqueId: string
      }) => void
    }) {
      return (
        <button
          type="button"
          onClick={() =>
            props.onCreateDraft({
              projectName: 'Guarded',
              projectDescription: '',
              projectAuthor: '',
              projectVersion: '1.0.0',
              projectUniqueId: 'Author.Guarded',
            })
          }
        >
          Create guarded draft
        </button>
      )
    }

    renderHost(
      {
        id: 'studio-desk',
        kind: 'workbench-view',
        viewId: 'studio-desk',
        title: 'Studio Desk',
        component: StudioDeskStub,
      },
      {
        cpMaker: { activeDraft: null, createDraft } as never,
        onRunWithCpMakerUnsavedGuard,
      },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create guarded draft' }))

    expect(onRunWithCpMakerUnsavedGuard).toHaveBeenCalledTimes(1)
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'Guarded',
        gameRootPath: null,
      }),
    )
  })
})
