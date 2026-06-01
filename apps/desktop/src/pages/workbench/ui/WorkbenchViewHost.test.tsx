import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import { WorkbenchViewHost } from './WorkbenchViewHost'

function renderHost(editModeView: WorkbenchViewRegistration) {
  return render(
    <WorkbenchViewHost
      editModeView={editModeView}
      workspaceMode="map"
      copy={editorCopy['en-US']}
      locale="en-US"
      theme="dark"
      accentColor="#22c55e"
      directoryInfo={null}
      canGoBack={false}
      canGoForward={false}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      cpMaker={{ activeDraft: null, createDraft: vi.fn(), addPatch: vi.fn() } as never}
      studioDeskModel={{} as never}
      onWorkbenchEvent={vi.fn()}
      navigateToPatch={vi.fn()}
      onSetWorkspaceMode={vi.fn()}
      onSetWorkspaceViewMode={vi.fn()}
      studioDeskGalleryOpen={false}
      onStudioDeskGalleryOpenChange={vi.fn()}
      studioDeskCreateDialogOpenSignal={0}
      activeEditPatchId={null}
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
})
