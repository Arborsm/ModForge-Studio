import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '@shared/contracts'
import { renderWithLocale } from '@test/renderWithLocale'
import { EventPatchEditor } from './EventPatchEditor'

vi.mock('./EventStagePreview', () => ({
  EventStagePreview: ({
    conditionBuilderLabel,
    onContextMenuAction,
  }: {
    conditionBuilderLabel?: string
    onContextMenuAction?: (action: 'conditionBuilder', tileX: number, tileY: number) => void
  }) => (
    <button type="button" onClick={() => onContextMenuAction?.('conditionBuilder', 0, 0)}>
      {conditionBuilderLabel}
    </button>
  ),
}))

function patch(): DraftPatch {
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
          'spring/Farmer 12 45/Abigail 12 45 2/speak Abigail "今天广场的人比平时多"',
      },
    },
  }
}

function draft(): GeneratedProjectDraft {
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
    patches: [patch()],
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

describe('EventPatchEditor secondary page shell', () => {
  test('omits the duplicated event toolbar and target row', () => {
    const { container } = renderWithLocale(
      <EventPatchEditor
        {...({
          patch: patch(),
          draft: draft(),
          selectedEventKey: 'event_square_meeting_1900',
          onPatchChange: vi.fn(),
          onAddVirtualAsset: vi.fn(),
        } as ComponentProps<typeof EventPatchEditor> & { selectedEventKey: string })}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.event-edit-toolbar')).toBeNull()
    expect(container.querySelector('.event-edit-target-row')).toBeNull()
  })

  test('opens the condition builder from the event editor context action', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <EventPatchEditor
        {...({
          patch: patch(),
          draft: draft(),
          selectedEventKey: 'event_square_meeting_1900',
          onPatchChange,
          onAddVirtualAsset: vi.fn(),
        } as ComponentProps<typeof EventPatchEditor> & { selectedEventKey: string })}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByRole('button', { name: '设计触发条件' }))

    expect(screen.getByRole('dialog', { name: '触发条件设计器' })).toBeTruthy()
    expect(screen.getByDisplayValue('event_square_meeting_1900')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '春' }))
    fireEvent.click(screen.getByRole('button', { name: '封装场次' }))

    expect(onPatchChange).toHaveBeenCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            'event_square_meeting_1900/Season Spring': expect.any(String),
          }),
        }),
      }),
    )
  })
})
