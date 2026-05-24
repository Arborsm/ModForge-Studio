import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS } from '../commandOptions'

export const otherCommandSchemas = [
  // Other

  {
    key: 'textAboveHead',
    label: 'Text Above Head',
    labelZh: '头顶文字',
    category: 'other',
    color: 'gray',
    icon: 'Type',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '头顶显示' },
      { type: 'param', index: 2, label: '文字', ui: 'text', placeholder: 'Hello!' },
    ],
  },

  {
    key: 'playerControl',
    label: 'Player Control',
    labelZh: '玩家控制',
    category: 'other',
    color: 'gray',
    icon: 'Gamepad2',
    template: [{ type: 'text', value: '切换玩家控制权' }],
  },

  {
    key: 'halt',
    label: 'Halt',
    labelZh: '停止',
    category: 'other',
    color: 'gray',
    icon: 'Octagon',
    template: [{ type: 'text', value: '停止脚本执行' }],
  },

  {
    key: 'ignoreMovementAnimation',
    label: 'Ignore Movement Animation',
    labelZh: '忽略移动动画',
    category: 'other',
    color: 'gray',
    icon: 'EyeOff',
    template: [
      { type: 'text', value: '忽略' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '移动动画' },
    ],
  },

  {
    key: 'ignoreCollisions',
    label: 'Ignore Collisions',
    labelZh: '忽略碰撞',
    category: 'other',
    color: 'gray',
    icon: 'EyeOff',
    template: [
      { type: 'text', value: '忽略' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '碰撞' },
    ],
  },

  {
    key: 'doAction',
    label: 'Do Action',
    labelZh: '执行动作',
    category: 'other',
    color: 'gray',
    icon: 'MousePointerClick',
    template: [
      { type: 'text', value: '在' },
      { type: 'param', index: 1, label: 'X', ui: 'number', placeholder: '0' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, label: 'Y', ui: 'number', placeholder: '0' },
      { type: 'text', value: '执行动作' },
    ],
  },
] satisfies CommandSchema[]
