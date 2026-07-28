import type { DialogueCommandCopy } from '@locales/model/workbench'

/** Shared by `dialogue` and `dialogue-script` so a command reads the same everywhere. */
export const dialogueCommandCopy: DialogueCommandCopy = {
  commandBadge: '高级指令',
  commandLabels: {
    c: '随机分支',
    p: '事件前置',
    d: '剧情标记分支',
    y: '快速问答',
    t: '时间段',
    k: '仅触发一次（事件）',
    '1': '仅触发一次（标记）',
    query: '游戏状态查询分支',
    action: '触发器动作',
  },
  commandArgLabels: {
    chance: '概率（0–1）',
    eventIds: '事件 ID',
    flag: '标记',
    quickQuestion: '问答串',
    timeFrom: '起始时间',
    timeTo: '结束时间',
    eventId: '事件 ID',
    onceId: '标记 ID',
    gameStateQuery: '游戏状态查询',
    triggerAction: '触发器动作',
  },
  branchTitleTemplate: '分支 {index}',
}
