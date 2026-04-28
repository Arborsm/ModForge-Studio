import { describe, expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import { renderWithLocale } from '../../test/renderWithLocale'
import { EventPatchEditor } from './EventPatchEditor'

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
})
