import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import type { DraftPatch, CpMakerDraft } from '@features/cp-maker'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { PatchListPage } from '@features/cp-maker/ui/PatchListPage'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

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
        event_square_meeting_1900: 'spring/Farmer 12 45/Abigail 12 45 2 Sam 13 45 2/speak Abigail "今天广场的人比平时多"/pause 500',
        event_market_after: 'spring/Farmer 44 57/Sam 44 57 2 Abigail 45 57 2/message "集市收尾"',
      },
    },
    ...overrides,
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
    patches: [eventPatch()],
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
    i18nFiles: [],
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

    fireEvent.contextMenu(screen.getByRole('button', { name: '#02event_square_meeting_1900' }))
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

    fireEvent.contextMenu(screen.getByRole('button', { name: '#02event_square_meeting_1900' }))
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

  test('opens the event condition builder from the event context menu and applies selected chips', async () => {
    const onPatchUpdate = vi.fn()
    renderWithLocale(
      <PatchListPage
        patches={[eventPatch()]}
        onEditPatch={vi.fn()}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        onPatchUpdate={onPatchUpdate}
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

    fireEvent.contextMenu(screen.getByRole('button', { name: '#02event_square_meeting_1900' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '设计触发条件' }))

    const dialog = await screen.findByRole('dialog', { name: '触发条件设计器' }, { timeout: 10000 })
    const dock = await screen.findByLabelText('窗口外预览', {}, { timeout: 10000 })
    expect(dialog).toBeTruthy()
    expect(dock).toBeTruthy()
    // The preview/chain docks live as siblings of the modal panel inside the
    // dialog card (rendered above/below it), not nested inside the panel.
    const modalPanel = document.body.querySelector('.event-condition-builder-modal')
    expect(modalPanel?.contains(dock)).toBe(false)
    expect(screen.getByText('像配置拍摄现场一样选择触发条件')).toBeTruthy()
    expect(modalPanel?.contains(screen.getByLabelText('逻辑链条预览'))).toBe(false)

    fireEvent.change(screen.getByLabelText('Event ID'), { target: { value: '' } })
    expect(screen.getByText('ID 不能为空')).toBeTruthy()
    expect(screen.getByRole('button', { name: '封装场次' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Event ID'), { target: { value: '{{ModId}}_abigail_secret' } })
    fireEvent.change(screen.getByLabelText('场景别名'), { target: { value: '阿比盖尔的秘密' } })
    fireEvent.click(screen.getByRole('button', { name: '春' }))

    expect(screen.getByText('春季')).toBeTruthy()
    expect(screen.getByText(/当 春季 时。/u)).toBeTruthy()
    expect(screen.getByText('Season Spring/')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '封装场次' }))

    expect(onPatchUpdate).toHaveBeenCalledWith(
      'patch-town',
      expect.objectContaining({
        editorState: expect.objectContaining({
          entries: expect.objectContaining({
            '{{ModId}}_abigail_secret/Season Spring': expect.any(String),
          }),
          eventAliases: {
            '{{ModId}}_abigail_secret/Season Spring': '阿比盖尔的秘密',
          },
        }),
      }),
    )
  })

  test('uses compact condition chips when the logic chain has many conditions', async () => {
    const { container } = renderWithLocale(
      <PatchListPage
        patches={[
          eventPatch({
            editorState: {
              entries: {
                'event_dense/Time 1900 2300/Season Spring/Weather sunny/Friendship Abigail 1000/SawEvent FestivalIntroSeen/LocalMail got_lantern/HasMoney 5000':
                  'spring/Farmer 12 45/Abigail 12 45 2/message "Dense"',
              },
            },
          }),
        ]}
        onEditPatch={vi.fn()}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        onPatchUpdate={vi.fn()}
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

    const treeEventButton = container.querySelector<HTMLButtonElement>('.event-patch-tree-event')
    expect(treeEventButton).toBeTruthy()
    fireEvent.contextMenu(treeEventButton!)
    fireEvent.click(screen.getByRole('menuitem', { name: '设计触发条件' }))

    const chain = await waitFor(() => {
      const element = document.body.querySelector('.condition-chip-scroll.compact')
      expect(element).toBeTruthy()
      return element
    })
    expect(chain).toBeTruthy()
    expect(chain?.querySelectorAll('.condition-chip').length).toBeGreaterThanOrEqual(7)
    expect(chain?.querySelector('.condition-chip-compact')?.textContent).toContain('19-23')
    expect(chain?.querySelector('.condition-chip-full')).toBeTruthy()
  })

  test('closes only the nested GameStateQuery builder on Escape', async () => {
    renderWithLocale(
      <PatchListPage
        patches={[eventPatch()]}
        onEditPatch={vi.fn()}
        onAddPatchRequest={vi.fn()}
        onRemovePatch={vi.fn()}
        onTogglePatch={vi.fn()}
        onPatchUpdate={vi.fn()}
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

    fireEvent.contextMenu(screen.getByRole('button', { name: '#02event_square_meeting_1900' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '设计触发条件' }))

    const parentDialog = await screen.findByRole('dialog', { name: '触发条件设计器' })
    fireEvent.click(screen.getByRole('button', { name: /高级查询/u }))
    fireEvent.click(screen.getByRole('button', { name: '打开 GameStateQuery 构建器' }))

    expect(await screen.findByRole('dialog', { name: 'GameStateQuery 构建器' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'GameStateQuery 构建器' })).toBeNull()
    })
    expect(parentDialog).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '触发条件设计器' })).toBeTruthy()
  })
})
