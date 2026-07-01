import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { useEffect } from 'react'
import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { registerWorkspacePlugin } from '@features/cp-maker/model/workspaceRegistry'
import { EditModeShell } from '@features/cp-maker/ui/EditModeShell'

registerWorkspacePlugin({
  id: 'events',
  label: 'Events',
  icon: 'Calendar',
  editMode: {
    patchListFields: [],
    targetPicker: () => null,
    editor: ({ patch, selectedEventKey, onSelectedEventKeyChange }) => {
      const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
      const entries = (editorState.entries as Record<string, unknown> | undefined) ?? {}
      const eventAliases = (editorState.eventAliases as Record<string, string> | undefined) ?? {}
      useEffect(() => {
        onSelectedEventKeyChange?.(selectedEventKey ?? Object.keys(entries)[0] ?? null)
      }, [entries, onSelectedEventKeyChange, selectedEventKey])

      return (
        <div>
          <aside className="border-l">
            script tools
            <span data-testid="selected-event-key">{selectedEventKey}</span>
            <span data-testid="selected-event-alias">{selectedEventKey ? eventAliases[selectedEventKey] : null}</span>
          </aside>
        </div>
      )
    },
  },
  serializer: {
    toChangeEntry: () => ({}),
    fromChangeEntry: () => ({}),
  },
})

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
        event_square_meeting_1900: 'spring/Farmer 12 45/Abigail 12 45 2 Sam 13 45 2/message "今天广场的人比平时多"',
      },
      eventAliases: {
        event_square_meeting_1900: 'Square meeting',
      },
    },
  }
}

function draft(patches: DraftPatch[]): CpMakerDraft {
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

describe('EditModeShell event patch hub header', () => {
  test('renders WIP edit workspaces with the shared empty-state card', () => {
    const { container } = renderWithLocale(
      <EditModeShell
        workspaceId="map"
        draft={draft([])}
        patches={[]}
        activePatchId={null}
        onSelectPatch={vi.fn()}
        onPatchAdd={vi.fn()}
        onPatchRemove={vi.fn()}
        onPatchUpdate={vi.fn()}
        onConfigSchemaChange={vi.fn()}
        onSaveDraft={vi.fn()}
        isDirty={false}
        onAddVirtualAsset={vi.fn()}
        onRemoveVirtualAsset={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.edit-mode-wip-page')).not.toBeNull()
    expect(container.querySelector('.empty-state-card')).not.toBeNull()
    expect(screen.getByText('WIP')).toBeInTheDocument()
    expect(screen.getByText('地图工作台正在搭建')).toBeInTheDocument()
  })

  test('renders event patch workspace actions in the header', () => {
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

    expect(container.querySelector('.event-patch-workspace-header')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Patch 设置' }))
    expect(screen.getByRole('button', { name: 'ConfigSchema' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /未保存/u }))
    expect(onSaveDraft).toHaveBeenCalledTimes(1)
  })

  test('moves the selected event key into the event editor context', async () => {
    const patches = [eventPatch()]
    const { container } = renderWithLocale(
      <EditModeShell
        workspaceId="events"
        draft={draft(patches)}
        patches={patches}
        activePatchId="patch-town"
        onSelectPatch={vi.fn()}
        onPatchAdd={vi.fn()}
        onPatchRemove={vi.fn()}
        onPatchUpdate={vi.fn()}
        onConfigSchemaChange={vi.fn()}
        onSaveDraft={vi.fn()}
        isDirty={false}
        onAddVirtualAsset={vi.fn()}
        onRemoveVirtualAsset={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.edit-mode-toolbar-context')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('selected-event-key').textContent).toBe('event_square_meeting_1900'))
    expect(screen.getByTestId('selected-event-alias').textContent).toBe('Square meeting')

    const scriptPanel = container.querySelector('aside.border-l') as HTMLElement
    expect(within(scriptPanel).getByText('script tools')).toBeTruthy()
  })
})
