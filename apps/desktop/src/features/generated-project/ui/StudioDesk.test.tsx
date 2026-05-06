import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi } from 'vitest'
import type { StudioDeskModel } from '../model/studioDeskModel'
import { formatStudioTimestamp } from '../model/studioDeskFormatting'
import type { EditorCopy } from '../../../locales'
import { localeBundles } from '../../../locales'
import { StudioDesk } from './StudioDesk'

function model(): StudioDeskModel {
  return {
    projectName: '星露谷夏日祭扩展',
    projectDescription: '一个正在生长的节日、剧情和地图创作项目。',
    projectUniqueId: 'Arbor.SummerFestival',
    hasActiveDraft: true,
    draftSummaries: [
      {
        draftStorageKey: 'draft-1',
        projectName: '星露谷夏日祭扩展',
        projectUniqueId: 'Arbor.SummerFestival',
        lastDraftSavedAt: Date.now() - 120_000,
        lastExportedAt: Date.now() - 600_000,
      },
      {
        draftStorageKey: 'draft-2',
        projectName: '海风旅店',
        projectUniqueId: 'Arbor.HarborInn',
        lastDraftSavedAt: Date.now() - 900_000,
        lastExportedAt: Date.now() - 1_200_000,
      },
    ],
    gallery: {
      counts: { all: 2, active: 2, export: 2, conflict: 1, archive: 0 },
      projects: [
        {
          draftStorageKey: 'draft-1',
          title: '星露谷夏日祭扩展',
          uniqueId: 'Arbor.SummerFestival',
          lastEditedAt: Date.now() - 120_000,
          lastExportedAt: Date.now() - 600_000,
          isCurrent: true,
          statuses: ['active', 'export', 'conflict'],
          searchText: '星露谷夏日祭扩展 Arbor.SummerFestival',
          coverTone: 'festival',
          conflictCount: 2,
        },
        {
          draftStorageKey: 'draft-2',
          title: '海风旅店',
          uniqueId: 'Arbor.HarborInn',
          lastEditedAt: Date.now() - 900_000,
          lastExportedAt: Date.now() - 1_200_000,
          isCurrent: false,
          statuses: ['active', 'export'],
          searchText: '海风旅店 Arbor.HarborInn',
          coverTone: 'harbor',
          conflictCount: 0,
        },
      ],
    },
    recentInspirations: [
      {
        patchId: 'event-1',
        kind: 'event',
        title: '阿比盖尔的秘密.event',
        target: 'Data/Events/Town',
        action: 'EditData',
        updatedAt: Date.now() - 120_000,
        status: 'modified',
        workspaceId: 'events',
      },
      {
        patchId: 'map-1',
        kind: 'map',
        title: '夏日祭广场.map',
        target: 'Maps/FestivalPlaza',
        action: 'EditMap',
        updatedAt: Date.now() - 720_000,
        status: 'synced',
        workspaceId: 'map',
      },
      {
        patchId: 'map-2',
        kind: 'map',
        title: '矿山入口.map',
        target: 'Maps/MineEntrance',
        action: 'EditMap',
        updatedAt: Date.now() - 840_000,
        status: 'synced',
        workspaceId: 'map',
      },
    ],
    workspaceEntrypoints: [
      { kind: 'independent-workspace', workspaceId: 'events', patchCount: 12 },
      { kind: 'independent-workspace', workspaceId: 'map', patchCount: 5 },
      { kind: 'independent-workspace', workspaceId: 'characters', patchCount: 0 },
      { kind: 'independent-workspace', workspaceId: 'buildings', patchCount: 0 },
      { kind: 'independent-workspace', workspaceId: 'items', patchCount: 0 },
      { kind: 'independent-workspace', workspaceId: 'mods', patchCount: 0 },
    ],
    stats: { eventCount: 12, mapCount: 5, festivalCount: 3, assetCount: 4, conflictCount: 2 },
    worldBible: {
      configSchema: [{ key: 'EnableFestival', value: 'true' }],
      tokens: [{ key: 'FestivalDay', value: '{{FestivalDay}}' }],
      customLocations: [{ key: 'FestivalPlaza', value: 'Maps/FestivalPlaza.tmx' }],
      actors: [{ key: 'Abigail', value: 'Characters/Abigail' }],
      story: [{ key: '阿比盖尔的秘密.event', value: 'Data/Events/Town' }],
      items: [{ key: '节日饮品', value: 'Data/Objects' }],
      scenes: [{ key: 'FestivalPlaza', value: 'Maps/FestivalPlaza.tmx' }],
      conflictCount: 2,
    },
    exportSummary: {
      lastExportedAt: Date.now() - 600_000,
      fileList: ['manifest.json', 'content.json', 'changes/events.json'],
    },
  }
}

function renderDesk(overrides: Partial<ComponentProps<typeof StudioDesk>> = {}) {
  const copy = localeBundles['zh-CN'].editor as EditorCopy
  const props: ComponentProps<typeof StudioDesk> = {
    model: model(),
    copy,
    onCreateDraft: vi.fn(),
    onCreatePatch: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onOpenPatch: vi.fn(),
    onOpenDraft: vi.fn(),
    onCopyDraft: vi.fn(),
    onDeleteDraft: vi.fn(),
    onExportPack: vi.fn(async () => {}),
    isLoading: false,
    ...overrides,
  }
  render(<StudioDesk {...props} />)
  return props
}

describe('StudioDesk', () => {
  test('starts in the project lobby with real draft cards', () => {
    renderDesk()

    expect(screen.getByRole('region', { name: /项目大厅/ })).toBeTruthy()
    expect(screen.getByText('2 个项目')).toBeTruthy()
    expect(screen.getByText('星露谷夏日祭扩展')).toBeTruthy()
    expect(screen.getByText('海风旅店')).toBeTruthy()
    expect(screen.queryByText('山脊夜市')).toBeNull()
  })

  test('filters project lobby cards by search text', () => {
    renderDesk()

    fireEvent.change(screen.getByRole('searchbox', { name: /搜索项目/ }), {
      target: { value: '海风' },
    })

    expect(screen.queryByText('星露谷夏日祭扩展')).toBeNull()
    expect(screen.getByText('海风旅店')).toBeTruthy()
  })

  test('opens an existing draft from the project lobby', () => {
    const props = renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /海风旅店/ }))

    expect(props.onOpenDraft).toHaveBeenCalledWith('draft-2')
    expect(screen.getByText('近期灵感堆栈')).toBeTruthy()
  })

  test('supports project context menu copy and delete actions', () => {
    const props = renderDesk()

    fireEvent.contextMenu(screen.getByRole('button', { name: /海风旅店/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /复制/ }))

    expect(props.onCopyDraft).toHaveBeenCalledWith('draft-2')

    fireEvent.contextMenu(screen.getByRole('button', { name: /海风旅店/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /删除/ }))
    fireEvent.click(screen.getByRole('button', { name: /^删除$/ }))

    expect(props.onDeleteDraft).toHaveBeenCalledWith('draft-2')
  })

  test('supports bulk project deletion from selected lobby cards', () => {
    const props = renderDesk()

    fireEvent.click(screen.getByRole('checkbox', { name: /选择 星露谷夏日祭扩展/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /选择 海风旅店/ }))
    fireEvent.click(screen.getByRole('button', { name: /批量删除/ }))
    fireEvent.click(screen.getByRole('button', { name: /^删除$/ }))

    expect(props.onDeleteDraft).toHaveBeenCalledWith('draft-1')
    expect(props.onDeleteDraft).toHaveBeenCalledWith('draft-2')
  })

  test('renders the three creation desk regions', () => {
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))

    expect(screen.getByText('近期灵感堆栈')).toBeTruthy()
    expect(screen.getByText('星露谷夏日祭扩展')).toBeTruthy()
    expect(screen.getByText('世界百科')).toBeTruthy()
  })

  test('can restore the creation desk without rendering project tabs', () => {
    renderDesk({ galleryOpen: false })

    expect(screen.queryByRole('region', { name: /项目大厅/ })).toBeNull()
    expect(screen.queryByRole('navigation', { name: /项目大厅/ })).toBeNull()
    expect(screen.getByText('近期灵感堆栈')).toBeTruthy()
    expect(screen.getByText('世界百科')).toBeTruthy()
  })

  test('opens independent workspace instead of global category', async () => {
    const props = renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续编写剧本/ }))

    expect(props.onOpenWorkspace).toHaveBeenCalledWith('events')
  })

  test('does not render token reference buttons', () => {
    renderDesk()

    expect(screen.queryByText('一键引用')).toBeNull()
    expect(screen.queryByText('引用')).toBeNull()
  })

  test('updates main stage preview when hovering an inspiration', async () => {
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))
    const storyboard = screen.getByRole('complementary', { name: /近期灵感堆栈/ })
    fireEvent.mouseEnter(within(storyboard).getByText('矿山入口.map'))
    fireEvent.click(screen.getByRole('button', { name: '地图' }))

    expect(screen.getByTestId('studio-preview-focus')).toHaveTextContent('map:矿山入口.map')
    expect(screen.getByText('地图工作台正在搭建')).toBeTruthy()
  })

  test('renders non-event console tabs as WIP placeholders without changing tab labels', () => {
    renderDesk({ galleryOpen: false })

    const stageSwitch = screen.getAllByLabelText('舞台中心').find((element) => element.classList.contains('studio-stage-switch'))
    expect(stageSwitch).toBeTruthy()
    const stageTabs = within(stageSwitch as HTMLElement)
    expect(stageTabs.getByRole('button', { name: '地图' })).toBeTruthy()
    fireEvent.click(stageTabs.getByRole('button', { name: '演员' }))

    expect(screen.getByText('演员工作台正在搭建')).toBeTruthy()
    expect(stageTabs.queryByRole('button', { name: /演员.*WIP/ })).toBeNull()
  })

  test('opens create project dialog from Studio Desk', async () => {
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /新建项目/ }))

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('starts a new creation inside the active project instead of creating a project', () => {
    const props = renderDesk({ galleryOpen: false })

    fireEvent.click(screen.getByRole('button', { name: /开启新创作/ }))

    expect(props.onCreatePatch).toHaveBeenCalledWith('EditData', 'events')
    expect(props.onCreateDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('opens export dialog without prompt', async () => {
    const promptSpy = vi.spyOn(globalThis, 'prompt')
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /打包发布/ })[0]!)

    expect(promptSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('opens and closes the world bible drawer affordance', () => {
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))
    const drawerButton = screen.getByRole('button', { name: /^世界百科$/ })
    fireEvent.click(drawerButton)

    expect(screen.getByRole('complementary', { name: /世界百科/ })).toHaveClass('studio-world-bible-open')
    expect(screen.getByTestId('studio-world-bible-backdrop')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /关闭世界百科/ }))

    expect(screen.getByRole('complementary', { name: /世界百科/ })).not.toHaveClass('studio-world-bible-open')
  })

  test('renders the mockup stage instead of engineering controls', () => {
    const props = renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /返回当前工作台/ }))
    expect(screen.getByText('创作控件')).toBeTruthy()
    expect(screen.getByText('剧本控制台')).toBeTruthy()
    expect(screen.getByRole('button', { name: '剧本' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '地图' })).toBeTruthy()
    expect(screen.getByText('Cartographer')).toBeTruthy()
    expect(screen.getByText('Cast & Props')).toBeTruthy()
    expect(screen.getAllByText('Data/Events/Town').length).toBeGreaterThan(0)
    expect(
      screen.getByText(formatStudioTimestamp(props.copy.studioDesk, props.model.exportSummary.lastExportedAt)),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /进入工作区/ })).toBeNull()
  })
})
