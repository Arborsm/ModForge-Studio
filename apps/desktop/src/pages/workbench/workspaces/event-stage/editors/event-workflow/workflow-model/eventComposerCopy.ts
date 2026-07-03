import type { LocaleCode } from '@locales/api'
import { useEventStageCopy } from '@locales/provider'
import { type EventScenarioPreset } from './eventScenarioPresets'

export type TextOperation = {
  operation: 'Append' | 'Prepend' | 'ReplaceDelimited' | 'RemoveDelimited'
  target: string[]
  value: string
  search?: string
  delimiter?: string
  replaceMode?: 'First' | 'All'
}

export function getEventComposerCopy(locale: LocaleCode | undefined, workflowCopy: ReturnType<typeof useEventStageCopy>['workflow']) {
  const zh = locale !== 'en-US'
  const presets = workflowCopy.presets
  return {
    addEvent: zh ? '新建事件' : 'New event',
    searchEvent: zh ? '搜索事件' : 'Search events',
    configure: zh ? '配置' : 'Configure',
    saved: zh ? '已保存' : 'Saved',
    unsaved: zh ? '未保存' : 'Unsaved',
    eventsHeading: zh ? '事件' : 'Events',
    searchEvents: zh ? '搜索事件、地点或角色' : 'Search events, locations, or actors',
    noEvents: zh ? '没有匹配的事件。' : 'No events found.',
    fromPreset: zh ? '从预设开始' : 'From preset',
    chooseEvent: zh ? '从左侧选择事件。' : 'Choose an event entry from the list.',
    configureGameRoot: zh ? '配置游戏目录后可渲染地图预览。' : 'Configure the game root to render the map preview.',
    music: zh ? '音乐' : 'Music',
    actor: zh ? '角色' : 'Actor',
    actors: zh ? '角色:' : 'Actors:',
    addActor: zh ? '添加角色' : 'Add actor',
    pick: zh ? '拾取' : 'Pick',
    pickCamera: zh ? '拾取镜头位置' : 'Pick camera position',
    commandCountShort: (count: number) => (zh ? `${count} 命令` : `${count} commands`),
    presetLabel: (preset: EventScenarioPreset) => presets[preset.id].label,
    presetDescription: (preset: EventScenarioPreset) => presets[preset.id].description,
    pathPointHint: (count: number) => (zh ? `已选择 ${count} 个路径点。` : `${count} path points selected.`),
    pathPickHint: zh ? '点击地图格子创建移动路径。' : 'Click map tiles to build the movement path.',
    coordinatePickHint: zh ? '点击地图选择坐标。' : 'Click the map to choose coordinates.',
    cameraPickHint: zh ? '点击地图设置镜头目标。' : 'Click the map to set the camera target.',
    actorPickHint: zh ? '点击地图放置角色。' : 'Click the map to place the actor.',
    donePath: zh ? '完成路径' : 'Done',
    clearPath: zh ? '清空路径' : 'Clear',
    cancelPick: zh ? '取消拾取' : 'Cancel',
  }
}
