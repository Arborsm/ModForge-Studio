import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, ITEM_OPTIONS } from '../commandOptions'

export const itemCommandSchemas = [
  // Item

  {
    key: 'addItem',
    label: 'Add Item',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', value: '添加物品' },
      { type: 'param', index: 1, label: '物品', ui: 'item', placeholder: 'ItemId', options: ITEM_OPTIONS },
      { type: 'text', value: '数量' },
      { type: 'param', index: 2, label: '数量', ui: 'number', placeholder: '1' },
    ],
  },

  {
    key: 'removeItem',
    label: 'Remove Item',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', value: '移除物品' },
      { type: 'param', index: 1, label: '物品', ui: 'item', placeholder: 'ItemId', options: ITEM_OPTIONS },
    ],
  },

  {
    key: 'money',
    label: 'Money',
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
    category: 'item',
    color: 'yellow',
    icon: 'ArrowUpCircle',
    template: [
      { type: 'text', value: '头顶显示物品' },
      { type: 'param', index: 1, label: '物品', ui: 'item', placeholder: 'ItemId', options: ITEM_OPTIONS },
    ],
  },

  {
    key: 'friendship',
    label: 'Friendship',
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
