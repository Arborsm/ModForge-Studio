import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, END_MODE_OPTIONS } from '../commandOptions'

export const dialogueCommandSchemas = [
  // Dialogue

  {
    key: 'speak',
    label: 'Speak',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquareText',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC 名称', options: ACTOR_OPTIONS },
      { type: 'text', value: '说：' },
      { type: 'param', index: 2, label: '内容', ui: 'textarea', placeholder: '对话内容' },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'splitSpeak',
    label: 'Split Speak',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquareText',
    template: [
      { type: 'text', value: '让' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC 名称', options: ACTOR_OPTIONS },
      { type: 'text', value: '分页说：' },
      { type: 'param', index: 2, label: '内容', ui: 'textarea', placeholder: '使用 # 分页' },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'message',
    label: 'Message',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquare',
    template: [
      { type: 'text', value: '显示消息：' },
      { type: 'param', index: 1, label: '内容', ui: 'textarea', placeholder: '消息内容' },
    ],
  },

  {
    key: 'end',
    label: 'End',
    category: 'dialogue',
    color: 'gray',
    icon: 'Octagon',
    template: [
      { type: 'text', value: '结束事件' },
      { type: 'param', index: 1, label: '模式', ui: 'choice', placeholder: 'dialogue / none', options: END_MODE_OPTIONS },
    ],
  },
] satisfies CommandSchema[]
