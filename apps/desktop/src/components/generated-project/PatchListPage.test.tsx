import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import { renderWithLocale } from '../../test/renderWithLocale'
import { PatchListPage } from './PatchListPage'

function eventPatch(overrides: Partial<DraftPatch> = {}): DraftPatch {
  return {
    id: 'patch-town',
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: 'Town_Events_Spring',
    enabled: true,
    when: { Season: 'spring' },
    editorState: {
      entries: {
        event_square_meeting_1900:
          'spring/Farmer 12 45/Abigail 12 45 2 Sam 13 45 2/speak Abigail "今天广场的人比平时多"/pause 500',
        event_market_after:
          'spring/Farmer 44 57/Sam 44 57 2 Abigail 45 57 2/message "集市收尾"',
      },
    },
    ...overrides,
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
    patches: [eventPatch()],
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

describe('PatchListPage event hub', () => {
  test('renders the event patch hub from real patch entries', () => {
    const { container } = renderWithLocale(
      <PatchListPage
        patches={[eventPatch()]}
        onEditPatch={vi.fn()}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onOpenConfig={vi.fn()}
        onSaveDraft={vi.fn()}
        workspaceId="events"
        draft={draft()}
        isDirty={false}
      />,
      'zh-CN',
    )

    expect(screen.getByLabelText('Patch 导航树')).toBeTruthy()
    expect(container.querySelector('.studio-tree-sidebar')).toBeTruthy()
    expect(container.querySelector('.studio-tree-item')).toBeTruthy()
    expect(container.querySelector('.studio-tree-child-item')).toBeTruthy()
    expect(screen.getByText('分镜看板')).toBeTruthy()
    expect(screen.queryByText('场记单')).toBeNull()
    expect(screen.queryByLabelText('事件预演')).toBeNull()
    expect(screen.getAllByText('Town_Events_Spring').length).toBeGreaterThan(0)
    expect(screen.getAllByText('event_square_meeting_1900').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sam/u).length).toBeGreaterThan(0)
  })

  test('enters the secondary editor with the selected event key', () => {
    const onEditPatch = vi.fn()
    renderWithLocale(
      <PatchListPage
        patches={[eventPatch()]}
        onEditPatch={onEditPatch}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onOpenConfig={vi.fn()}
        onSaveDraft={vi.fn()}
        workspaceId="events"
        draft={draft()}
        isDirty={false}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByRole('button', { name: '进入编辑器 event_square_meeting_1900' }))

    expect(onEditPatch).toHaveBeenCalledWith('patch-town', 'event_square_meeting_1900')
  })

  test('renders semantic event preconditions in the expanded scene panel', () => {
    renderWithLocale(
      <PatchListPage
        patches={[
          eventPatch({
            editorState: {
              entries: {
                'event_market/Season Spring/Time 1400 2300/!Weather rainy/Friendship Clint 750/SawEvent FestivalIntroSeen/DaysPlayed 28':
                  'spring/Farmer 12 45/Clint 12 45 2/message "Market"',
              },
            },
          }),
        ]}
        onEditPatch={vi.fn()}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onOpenConfig={vi.fn()}
        onSaveDraft={vi.fn()}
        workspaceId="events"
        draft={draft()}
        isDirty={false}
      />,
      'zh-CN',
    )

    expect(screen.getByText('春季')).toBeTruthy()
    expect(screen.getByText('14:00 - 23:00')).toBeTruthy()
    expect(screen.getByText('非雨天')).toBeTruthy()
    expect(screen.getByText('Clint 友谊至少 750')).toBeTruthy()
    expect(screen.getByText('已看过任一事件：FestivalIntroSeen')).toBeTruthy()
    expect(screen.getByText('已游玩至少 28 天')).toBeTruthy()
  })

  test('supports multi-select and patch/event context menu actions', () => {
    const onEditPatch = vi.fn()
    const onPatchUpdate = vi.fn()
    const onRemovePatch = vi.fn()
    const onOpenConfig = vi.fn()
    const onDuplicatePatch = vi.fn()
    renderWithLocale(
      <PatchListPage
        patches={[eventPatch()]}
        onEditPatch={onEditPatch}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={onRemovePatch}
        onTogglePatch={vi.fn()}
        onPatchUpdate={onPatchUpdate}
        onDuplicatePatch={onDuplicatePatch}
        canGoBack={false}
        canGoForward={false}
        onGoBack={vi.fn()}
        onGoForward={vi.fn()}
        onOpenConfig={onOpenConfig}
        onSaveDraft={vi.fn()}
        workspaceId="events"
        draft={draft()}
        isDirty={false}
      />,
      'zh-CN',
    )

    fireEvent.click(screen.getByRole('button', { name: '多选模式' }))
    fireEvent.click(screen.getByRole('button', { name: '选择事件 event_square_meeting_1900' }))
    expect(screen.getByRole('button', { name: '多选模式 · 1' })).toBeTruthy()

    fireEvent.contextMenu(screen.getByRole('button', { name: /Town_Events_Spring/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: '配置 Patch' }))
    expect(onOpenConfig).toHaveBeenCalledTimes(1)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Town_Events_Spring/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: '复制 Patch' }))
    expect(onDuplicatePatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'patch-town' }))

    fireEvent.contextMenu(screen.getByRole('button', { name: '进入编辑器 event_square_meeting_1900' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '复制场次' }))
    expect(onPatchUpdate).toHaveBeenCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            event_square_meeting_1900_copy: expect.any(String),
          }),
        }),
      }),
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: '进入编辑器 event_square_meeting_1900' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除事件' }))
    expect(onPatchUpdate).toHaveBeenLastCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.not.objectContaining({
            event_square_meeting_1900: expect.any(String),
          }),
        }),
      }),
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /Town_Events_Spring/u }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除 Patch' }))
    expect(onRemovePatch).toHaveBeenCalledWith('patch-town')
  })
})
