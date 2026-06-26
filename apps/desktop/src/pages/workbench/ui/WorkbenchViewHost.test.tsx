import { screen } from '@testing-library/react'
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
      onWorkbenchEvent={vi.fn()}
      navigateToPatch={vi.fn()}
      onSetWorkspaceMode={vi.fn()}
      onRunWithModUnsavedGuard={async (action) => {
        await action()
        return true
      }}
      onRunWithCpMakerUnsavedGuard={onRunWithCpMakerUnsavedGuard}
      onSetWorkspaceViewMode={vi.fn()}
      activeEditPatchId={null}
      {...overrides}
    />,
  )
}

describe('WorkbenchViewHost', () => {
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
})
