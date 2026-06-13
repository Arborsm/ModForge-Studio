import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useState, type ComponentProps, type ReactNode } from 'react'
import type { DraftPatch, CpMakerDraft } from '@shared/contracts'
import type { EventScript } from '@entities/event'
import { renderWithLocale } from '@test/renderWithLocale'
import { EventPatchEditor } from './EventPatchEditor'

vi.mock('./EventStagePreview', () => ({
  EventStagePreview: ({
    conditionBuilderLabel,
    eventScript,
    additionalViewportOverlay,
    onContextMenuAction,
    onTileClick,
  }: {
    conditionBuilderLabel?: string
    eventScript?: EventScript | null
    additionalViewportOverlay?: ReactNode
    onContextMenuAction?: (action: 'conditionBuilder' | 'addActor' | 'setCamera' | 'addWarp', tileX: number, tileY: number) => void
    onTileClick?: (tileX: number, tileY: number) => void
  }) => (
    <div>
      <div data-testid="stage-event-id">{eventScript?.eventId}</div>
      <div data-testid="stage-actor-names">
        {eventScript?.scene?.actors?.map((actor: { actorName: string }) => actor.actorName).join(',') ?? ''}
      </div>
      <button type="button" onClick={() => onContextMenuAction?.('conditionBuilder', 0, 0)}>
        {conditionBuilderLabel}
      </button>
      <button type="button" onClick={() => onContextMenuAction?.('addActor', 8, 9)}>
        Add Actor Here
      </button>
      <button type="button" onClick={() => onContextMenuAction?.('addWarp', 6, 7)}>
        Add Warp Here
      </button>
      <button type="button" onClick={() => onTileClick?.(10, 11)}>
        Pick Path A
      </button>
      <button type="button" onClick={() => onTileClick?.(12, 11)}>
        Pick Path B
      </button>
      <button type="button" onClick={() => onTileClick?.(12, 14)}>
        Pick Path C
      </button>
      {additionalViewportOverlay}
    </div>
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
        event_square_meeting_1900: 'spring/Farmer 12 45/Abigail 12 45 2/speak Abigail "今天广场的人比平时多"',
      },
    },
  }
}

function draft(): CpMakerDraft {
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

function StatefulEventPatchEditor({
  initialPatch,
  onPatchChange,
}: {
  initialPatch: DraftPatch
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
}) {
  const [currentPatch, setCurrentPatch] = useState(initialPatch)

  return (
    <EventPatchEditor
      patch={currentPatch}
      draft={{ ...draft(), patches: [currentPatch] }}
      selectedEventKey="event_square_meeting_1900"
      onAddVirtualAsset={vi.fn()}
      onPatchChange={(patchId, patchUpdate) => {
        onPatchChange(patchId, patchUpdate)
        setCurrentPatch((patch) => ({ ...patch, ...patchUpdate }))
      }}
    />
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function selectResource(title: string, query: string, optionName?: string, triggerIndex = -1) {
  const triggers = screen
    .getAllByTitle(new RegExp(`^${escapeRegExp(title)}(?::|$)`, 'u'))
    .filter((element) => element.tagName.toLowerCase() === 'button')
  const trigger = triggers.at(triggerIndex)!
  fireEvent.click(trigger)
  const picker = screen.getByRole('dialog')
  fireEvent.change(within(picker).getByRole('textbox'), { target: { value: query } })
  const matches = within(picker).getAllByRole('button', { name: new RegExp(escapeRegExp(optionName ?? query), 'u') })
  fireEvent.click(matches[0]!)
}

function clickLastPathPicker() {
  fireEvent.click(screen.getAllByTitle(/^路径(?::|$)/u).at(-1)!)
}

function openEventPicker() {
  const picker = document.querySelector('.event-picker') as HTMLButtonElement | null
  if (!picker) {
    throw new Error('Event picker was not rendered')
  }
  fireEvent.click(picker)
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
          theme: 'dark',
          accentColor: '#3b82f6',
        } as ComponentProps<typeof EventPatchEditor> & { selectedEventKey: string })}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.event-edit-toolbar')).toBeNull()
    expect(container.querySelector('.event-edit-target-row')).toBeNull()
    const shell = container.querySelector('.event-edit-shell') as HTMLElement
    expect(shell.classList.contains('dark')).toBe(true)
    expect(shell.style.getPropertyValue('--accent')).toBe('#3b82f6')
    expect(shell.style.getPropertyValue('--bg-panel')).toBe('#1a1f27')
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

  test('keeps a graphically edited trigger bound to its selected event location', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'wavy/34 11/farmer 34 14 0 Elliott 37 11 3/skippable/end dialogue',
            },
            eventAliases: {
              event_square_meeting_1900: 'Lost shell on the pier',
            },
            eventLocations: {
              event_square_meeting_1900: 'Beach',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByRole('button', { name: '设计触发条件' }))
    fireEvent.click(screen.getByRole('button', { name: '夏' }))
    fireEvent.click(screen.getByRole('button', { name: '封装场次' }))

    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          eventAliases: expect.objectContaining({
            'event_square_meeting_1900/Season Summer': 'Lost shell on the pier',
          }),
          eventLocations: expect.objectContaining({
            'event_square_meeting_1900/Season Summer': 'Beach',
          }),
        }),
      }),
    )
    const nextEditorState = onPatchChange.mock.lastCall?.[1]?.editorState as Record<string, unknown>
    expect(nextEditorState.eventLocations).not.toHaveProperty('event_square_meeting_1900')
    expect(screen.getByTestId('stage-event-id').textContent).toBe('event_square_meeting_1900/Season Summer')
    expect(screen.getByTestId('stage-actor-names').textContent).toBe('farmer,Elliott')
  })

  test('creates graphical sample events across locations and command categories', () => {
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

    openEventPicker()
    fireEvent.click(screen.getByRole('button', { name: /海滩失物/u }))
    expect(onPatchChange).toHaveBeenLastCalledWith('patch-town', expect.not.objectContaining({ target: expect.anything() }))
    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            '900002/Season summer/Time 1200 1800': expect.stringContaining('itemAboveHead "(O)372"'),
          }),
          eventAliases: expect.objectContaining({
            '900002/Season summer/Time 1200 1800': 'Lost shell on the pier',
          }),
          eventLocations: expect.objectContaining({
            '900002/Season summer/Time 1200 1800': 'Beach',
          }),
        }),
      }),
    )

    openEventPicker()
    fireEvent.click(screen.getByRole('button', { name: /矿井救援分支/u }))
    expect(onPatchChange).toHaveBeenLastCalledWith('patch-town', expect.not.objectContaining({ target: expect.anything() }))
    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            '900003/PlayerGender male female/MailReceived guildMember': expect.stringContaining('animate Shadow true true'),
          }),
          eventLocations: expect.objectContaining({
            '900003/PlayerGender male female/MailReceived guildMember': 'Mine',
          }),
        }),
      }),
    )
  })

  test('reapplies a preset by replacing the previous event with the same id', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              '900001/Season spring/Time 900 1400': 'spring/12 45/farmer 12 47 0/end dialogue',
              event_square_meeting_1900: 'spring/Farmer 12 45/Abigail 12 45 2/end dialogue',
            },
            eventAliases: {
              '900001/Season spring/Time 900 1400': 'Old town scene',
              event_square_meeting_1900: 'Square meeting',
            },
            eventLocations: {
              '900001/Season spring/Time 900 1400': 'Town',
              event_square_meeting_1900: 'Town',
            },
            disabledEventKeys: ['900001/Season spring/Time 900 1400'],
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    openEventPicker()
    fireEvent.click(screen.getByRole('button', { name: /小镇集市开场/u }))

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900001/Season spring/Time 900 1400/Weather Sun': expect.stringContaining('addItem "(O)24" 1'),
              event_square_meeting_1900: expect.any(String),
            }),
            eventAliases: expect.objectContaining({
              '900001/Season spring/Time 900 1400/Weather Sun': 'Spring market meeting',
            }),
            eventLocations: expect.objectContaining({
              '900001/Season spring/Time 900 1400/Weather Sun': 'Town',
            }),
            disabledEventKeys: [],
          }),
        }),
      ),
    )
    const nextEditorState = onPatchChange.mock.lastCall?.[1]?.editorState as {
      entries: Record<string, unknown>
      eventAliases: Record<string, unknown>
      eventLocations: Record<string, unknown>
    }
    expect(Object.keys(nextEditorState.entries).filter((key) => key.startsWith('900001/'))).toEqual([
      '900001/Season spring/Time 900 1400/Weather Sun',
    ])
    expect(Object.keys(nextEditorState.eventAliases).filter((key) => key.startsWith('900001/'))).toEqual([
      '900001/Season spring/Time 900 1400/Weather Sun',
    ])
    expect(Object.keys(nextEditorState.eventLocations).filter((key) => key.startsWith('900001/'))).toEqual([
      '900001/Season spring/Time 900 1400/Weather Sun',
    ])
    expect(screen.getByTestId('stage-event-id').textContent).toBe('900001/Season spring/Time 900 1400/Weather Sun')
    expect(screen.getByTestId('stage-actor-names').textContent).toBe('farmer,Abigail,Lewis')
  })

  test('selects generated event cards and edits the chosen event graphically', () => {
    const onPatchChange = vi.fn()
    const state = {
      entries: {
        event_square_meeting_1900: 'spring/Farmer 12 45/Abigail 12 45 2/speak Abigail "今天广场的人比平时多"',
        '900002/Season summer/Time 1200 1800':
          'wavy/34 11/farmer 34 14 0 Elliott 37 11 3/skippable/itemAboveHead "(O)372"/farmerAnimation 7/end dialogue',
      },
      eventAliases: {
        '900002/Season summer/Time 1200 1800': 'Lost shell on the pier',
      },
    }

    renderWithLocale(
      <EventPatchEditor
        {...({
          patch: { ...patch(), target: 'Data/Events/Beach', editorState: state },
          draft: draft(),
          onPatchChange,
          onAddVirtualAsset: vi.fn(),
        } as ComponentProps<typeof EventPatchEditor>)}
      />,
      'zh-CN',
    )

    openEventPicker()
    fireEvent.click(screen.getByRole('button', { name: /Lost shell on the pier/u }))
    expect(screen.getByTestId('stage-event-id').textContent).toBe('900002/Season summer/Time 1200 1800')

    selectResource('音乐', 'spring2')
    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            '900002/Season summer/Time 1200 1800': expect.stringMatching(/^spring2\/34 11/u),
          }),
        }),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Actor Here' }))
    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            '900002/Season summer/Time 1200 1800': expect.stringContaining('actor3 8 9 2'),
          }),
        }),
      }),
    )
  })

  test('builds a move command by selecting a path on the stage', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/move Abigail',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    clickLastPathPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path A' }))
    expect(screen.getByRole('button', { name: '完成路径' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path B' }))
    expect(screen.getByRole('button', { name: '完成路径' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path C' }))
    expect(screen.getByRole('button', { name: '完成路径' })).toBeTruthy()

    expect(onPatchChange).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/move Abigail -2 -34 0 Abigail 2 0 1 Abigail 0 3 2',
          }),
        }),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '完成路径' }))
    expect(screen.queryByText(/path points/u)).toBeNull()
  })

  test('clears a graphical movement path without keyboard shortcuts', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/move Abigail',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    clickLastPathPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path B' }))

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/move Abigail -2 -34 0 Abigail 2 0 1',
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: '清空路径' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/move Abigail',
            }),
          }),
        }),
      ),
    )
    expect(screen.getByText('点击地图格子创建移动路径。')).toBeTruthy()
  })

  test('adds a command from the visible graphical command palette and edits it', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'spring/follow/farmer 12 45 2/end dialogue',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByTitle('添加命令'))
    fireEvent.click(screen.getByRole('button', { name: /消息 message/u }))

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: expect.stringContaining('message "A message appears..."'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('内容: A message appears...'))
    fireEvent.change(screen.getByDisplayValue('A message appears...'), { target: { value: 'A bell rings from the plaza.' } })
    fireEvent.keyDown(screen.getByDisplayValue('A bell rings from the plaza.'), { key: 'Enter' })

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: expect.stringContaining('message "A bell rings from the plaza."'),
            }),
          }),
        }),
      ),
    )
  })

  test('builds a new event graphically from a starter scene', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'spring/follow/farmer 12 45 2/end dialogue',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    openEventPicker()
    fireEvent.click(screen.getAllByRole('button', { name: '新建事件' })[0]!)

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': 'spring2/12 12/farmer 12 14 0/skippable/end dialogue',
            }),
            eventAliases: expect.objectContaining({
              '900002/Season spring/Time 900 1700': 'Untitled Town event 2',
            }),
            eventLocations: expect.objectContaining({
              '900002/Season spring/Time 900 1700': 'Town',
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Actor Here' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('actor2 8 9 2'),
            }),
          }),
        }),
      ),
    )

    selectResource('角色: actor2', 'JunimoGuide', 'JunimoGuide')
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('JunimoGuide 8 9 2'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('添加命令'))
    fireEvent.click(screen.getByRole('button', { name: /移动 move/u }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('/move Abigail'),
            }),
          }),
        }),
      ),
    )
    selectResource('角色: Abigail', 'JunimoGuide', 'JunimoGuide')
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('move JunimoGuide 0 0 2'),
            }),
          }),
        }),
      ),
    )
    clickLastPathPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path B' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('move JunimoGuide 2 2 2 JunimoGuide 2 0 1'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('添加命令'))
    fireEvent.click(screen.getByRole('button', { name: /添加物品 addItem/u }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('addItem "(O)24" 1'),
            }),
          }),
        }),
      ),
    )
    selectResource('物品', 'Diamond', 'Diamond', -1)
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('addItem (O)72 1'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('添加命令'))
    fireEvent.click(screen.getByRole('button', { name: /动画 animate/u }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('animate Abigail true true 100 0 1 2 3'),
            }),
          }),
        }),
      ),
    )
    fireEvent.click(screen.getByTitle('帧: 0 1 2 3'))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Gesture 16-19' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season spring/Time 900 1700': expect.stringContaining('animate Abigail true true 100 16 17 18 19'),
            }),
          }),
        }),
      ),
    )
  }, 15_000)

  test('picks coordinates graphically for warp and edits quick choice branches as fields', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900:
                'spring/follow/farmer 12 45 2 Abigail 12 45 2/warp farmer 10 11 2/quickQuestion "Hold the lantern?#Yes#No\\glow farmer\\screenFlash"',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByTitle('X: 10, Y: 11'))
    fireEvent.click(screen.getByTitle('Pick from map'))
    fireEvent.click(screen.getByRole('button', { name: 'Pick Path C' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: expect.stringContaining('warp farmer 12 14 2'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle(/问题和分支: Hold the lantern/u))
    fireEvent.change(screen.getByDisplayValue('Hold the lantern?'), { target: { value: 'Take the lantern?' } })
    fireEvent.change(screen.getByDisplayValue('glow farmer'), { target: { value: 'message Light held high.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: expect.stringContaining(
                'quickQuestion "Take the lantern?#Yes#No(break)message Light held high.(break)screenFlash"',
              ),
            }),
          }),
        }),
      ),
    )
  })

  test('keeps graphical pill controls from bubbling into command card selection', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              event_square_meeting_1900: 'spring/follow/Abigail 12 45 2/addItem "(O)24" 1',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    selectResource('物品', 'Diamond', 'Diamond', -1)

    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              event_square_meeting_1900: expect.stringContaining('addItem (O)72 1'),
            }),
          }),
        }),
      ),
    )
    expect(screen.queryByRole('dialog', { name: '添加命令' })).toBeNull()
    expect(screen.queryByRole('button', { name: /消息 message/u })).toBeNull()
  })

  test('edits item, object, and animation commands through graphical pills', async () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <StatefulEventPatchEditor
        initialPatch={{
          ...patch(),
          editorState: {
            entries: {
              '900002/Season summer/Time 1200 1800':
                'wavy/34 11/farmer 34 14 0 Elliott 37 11 3/skippable/addObject 35 12 "(O)372"/farmerAnimation 7/itemAboveHead "(O)372"/animate Elliott true true 120 0 1 2 3/end dialogue',
            },
            eventAliases: {
              '900002/Season summer/Time 1200 1800': 'Lost shell on the pier',
            },
            eventLocations: {
              '900002/Season summer/Time 1200 1800': 'Beach',
            },
          },
        }}
        onPatchChange={onPatchChange}
      />,
      'zh-CN',
    )

    selectResource('物体', 'Starfruit', 'Starfruit')
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season summer/Time 1200 1800': expect.stringContaining('addObject 35 12 (O)268'),
            }),
          }),
        }),
      ),
    )

    selectResource('物品', 'Diamond', 'Diamond')
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season summer/Time 1200 1800': expect.stringContaining('itemAboveHead (O)72'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('动画: 7'))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season summer/Time 1200 1800': expect.stringContaining('farmerAnimation 3'),
            }),
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByTitle('帧: 0 1 2 3'))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Gesture 16-19' }))
    await waitFor(() =>
      expect(onPatchChange).toHaveBeenLastCalledWith(
        'patch-town',
        expect.objectContaining({
          editorState: expect.objectContaining({
            entries: expect.objectContaining({
              '900002/Season summer/Time 1200 1800': expect.stringContaining('animate Elliott true true 120 16 17 18 19'),
            }),
          }),
        }),
      ),
    )
  })
})
