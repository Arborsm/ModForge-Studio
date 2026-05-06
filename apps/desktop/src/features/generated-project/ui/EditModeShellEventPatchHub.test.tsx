import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { DraftPatch, GeneratedProjectDraft } from '@shared/contracts'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { EditModeShell } from './EditModeShell'

function eventPatch(): DraftPatch {
  return {
    id: 'patch-town',
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: 'Town_Events_Spring',
    enabled: true,
    editorState: {
      entries: {
        event_square_meeting_1900:
          'spring/Farmer 12 45/Abigail 12 45 2 Sam 13 45 2/message "今天广场的人比平时多"',
      },
    },
  }
}

function draft(patches: DraftPatch[]): GeneratedProjectDraft {
  return {
    draftStorageKey: 'draft-1',
    projectMetadata: {
      projectName: '春日集市重制',
      projectDescription: '',
      projectAuthor: 'Arbor',
      projectVersion: '1.0.0',
      projectUniqueId: 'Arbor.SpringMarket',
      gameRootPath: null,
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    },
    overlayTargets: [],
    configSchema: [],
    patches,
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

describe('EditModeShell event patch hub toolbar replacement', () => {
  test('uses the event patch workspace header instead of the old edit toolbar', () => {
    const patches = [eventPatch()]
    const onSaveDraft = vi.fn()
    const { container } = renderWithLocale(
      <EditModeShell
        workspaceId="events"
        draft={draft(patches)}
        patches={patches}
        activePatchId={null}
        onSelectPatch={vi.fn()}
        onPatchAdd={vi.fn()}
        onPatchRemove={vi.fn()}
        onPatchUpdate={vi.fn()}
        onConfigSchemaChange={vi.fn()}
        onSaveDraft={onSaveDraft}
        isDirty={true}
        onAddVirtualAsset={vi.fn()}
        onRemoveVirtualAsset={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.edit-mode-toolbar')).toBeNull()
    expect(container.querySelector('.event-patch-workspace-header')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Patch 设置' }))
    expect(screen.getByRole('button', { name: 'ConfigSchema' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /未保存/u }))
    expect(onSaveDraft).toHaveBeenCalledTimes(1)
  })
})
