import type { EventCommand, EventScript } from './types'

export const EVENT_SETUP_ENTRY_ID = 'setup'

export type EventTimelineEntry = {
  id: string
  title: string
  detail: string
  kind: EventCommand['kind'] | 'setup'
  command: EventCommand | null
}

export function buildEventTimelineLabels(locale: 'zh-CN' | 'en-US') {
  return locale === 'zh-CN'
    ? {
        setup: '场景初始化',
        music: '音乐',
        camera: '镜头',
        actors: '角色',
      }
    : {
        setup: 'Scene Setup',
        music: 'Music',
        camera: 'Camera',
        actors: 'Actors',
      }
}

export function buildEventSceneSummary(event: EventScript, locale: 'zh-CN' | 'en-US') {
  const labels = buildEventTimelineLabels(locale)

  return [
    `${labels.music}: ${event.scene.musicCue ?? 'none'}`,
    `${labels.camera}: ${event.scene.cameraInstruction ?? 'follow'}`,
    `${labels.actors}: ${event.scene.actors.length}`,
  ].join(' | ')
}

export function buildEventTimelineEntries(event: EventScript | null, locale: 'zh-CN' | 'en-US'): EventTimelineEntry[] {
  if (!event) {
    return []
  }

  return [
    {
      id: EVENT_SETUP_ENTRY_ID,
      title: buildEventTimelineLabels(locale).setup,
      detail: buildEventSceneSummary(event, locale),
      kind: 'setup',
      command: null,
    },
    ...event.commands.map((command) => ({
      id: command.id,
      title: command.title,
      detail: command.detail,
      kind: command.kind,
      command,
    })),
  ]
}
