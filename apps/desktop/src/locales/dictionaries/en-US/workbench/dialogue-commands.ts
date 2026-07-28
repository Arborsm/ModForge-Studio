import type { DialogueCommandCopy } from '@locales/model/workbench'

/** Shared by `dialogue` and `dialogue-script` so a command reads the same everywhere. */
export const dialogueCommandCopy: DialogueCommandCopy = {
  commandBadge: 'Advanced command',
  commandLabels: {
    c: 'Random branch',
    p: 'Event prerequisite',
    d: 'Story flag branch',
    y: 'Quick question',
    t: 'Time window',
    k: 'Once per event',
    '1': 'Once per flag',
    query: 'Game state query branch',
    action: 'Trigger action',
  },
  commandArgLabels: {
    chance: 'Chance (0–1)',
    eventIds: 'Event ids',
    flag: 'Flag',
    quickQuestion: 'Question string',
    timeFrom: 'From time',
    timeTo: 'To time',
    eventId: 'Event id',
    onceId: 'Flag id',
    gameStateQuery: 'Game state query',
    triggerAction: 'Trigger action',
  },
  branchTitleTemplate: 'Branch {index}',
}
