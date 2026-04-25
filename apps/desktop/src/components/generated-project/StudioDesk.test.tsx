import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, test, vi } from 'vitest'
import type { StudioDeskModel } from '../../lib/app/studioDeskModel'
import type { EditorCopy } from '../../locales'
import { localeBundles } from '../../locales'
import { StudioDesk } from './StudioDesk'

function model(): StudioDeskModel {
  return {
    projectName: '星露谷夏日祭扩展',
    projectDescription: '一个正在生长的节日、剧情和地图创作项目。',
    projectUniqueId: 'Arbor.SummerFestival',
    hasActiveDraft: true,
    draftSummaries: [],
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
    stats: { eventCount: 12, mapCount: 5, festivalCount: 3, conflictCount: 2 },
    worldBible: {
      configSchema: [{ key: 'EnableFestival', value: 'true' }],
      tokens: [{ key: 'FestivalDay', value: '{{FestivalDay}}' }],
      customLocations: [{ key: 'FestivalPlaza', value: 'Maps/FestivalPlaza.tmx' }],
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
    onExportPack: vi.fn(async () => {}),
    isLoading: false,
    ...overrides,
  }
  render(<StudioDesk {...props} />)
  return props
}

describe('StudioDesk', () => {
  test('renders the three creation desk regions', () => {
    renderDesk()

    expect(screen.getByText('近期灵感堆栈')).toBeTruthy()
    expect(screen.getByText('星露谷夏日祭扩展')).toBeTruthy()
    expect(screen.getByText('世界百科')).toBeTruthy()
  })

  test('opens independent workspace instead of global category', async () => {
    const props = renderDesk()

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

    fireEvent.mouseEnter(screen.getByText('矿山入口.map'))

    expect(screen.getByTestId('studio-preview-focus')).toHaveTextContent('map:矿山入口.map')
    expect(screen.getByTestId('studio-map-preview-title')).toHaveTextContent('矿山入口.map')
  })

  test('opens create project dialog from Studio Desk', async () => {
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /开启新创作/ }))

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('opens export dialog without prompt', async () => {
    const promptSpy = vi.spyOn(globalThis, 'prompt')
    renderDesk()

    fireEvent.click(screen.getByRole('button', { name: /打包发布/ }))

    expect(promptSpy).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  test('renders the mockup stage instead of engineering controls', () => {
    renderDesk()

    expect(screen.getByText('Scriptwriter')).toBeTruthy()
    expect(screen.getByText('Cartographer')).toBeTruthy()
    expect(screen.getByText('Cast & Props')).toBeTruthy()
    expect(screen.getByText('Abigail')).toBeTruthy()
    expect(screen.getByText(/选择分支/)).toBeTruthy()
    expect(screen.getByText('Project Pulse')).toBeTruthy()
    expect(screen.getByText('最近修改')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /进入工作区/ })).toBeNull()
  })
})
