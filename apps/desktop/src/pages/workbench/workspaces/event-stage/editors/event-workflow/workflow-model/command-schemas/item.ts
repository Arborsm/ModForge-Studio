import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS } from '../commandOptions'

export const itemCommandSchemas = [
  // Item

  {
    key: 'addItem',
    label: 'Add Item',
    labelZh: '添加物品',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', value: '添加物品' },
      { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
    ],
  },

  {
    key: 'removeItem',
    label: 'Remove Item',
    labelZh: '移除物品',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', value: '移除物品' },
      { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
    ],
  },

  {
    key: 'money',
    label: 'Money',
    labelZh: '金钱',
    category: 'item',
    color: 'yellow',
    icon: 'Coins',
    template: [
      { type: 'text', value: '金钱' },
      { type: 'param', index: 1, label: '金额', ui: 'number', placeholder: '100' },
    ],
  },

  {
    key: 'itemAboveHead',
    label: 'Item Above Head',
    labelZh: '头顶物品',
    category: 'item',
    color: 'yellow',
    icon: 'ArrowUpCircle',
    template: [
      { type: 'text', value: '头顶显示物品' },
      { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
    ],
  },

  {
    key: 'friendship',
    label: 'Friendship',
    labelZh: '好感度',
    category: 'item',
    color: 'yellow',
    icon: 'Heart',
    template: [
      { type: 'text', value: '增加' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector', placeholder: 'NPC', options: ACTOR_OPTIONS },
      { type: 'text', value: '好感度' },
      { type: 'param', index: 2, label: '数值', ui: 'number', placeholder: '250' },
    ],
  },
] satisfies CommandSchema[]
