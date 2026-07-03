import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, ITEM_OPTIONS } from '../commandOptions'

export const itemCommandSchemas = [
  // Item

  {
    key: 'addItem',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', copyKey: 'addItem.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addItem.param1.label',
        ui: 'item',
        placeholderKey: 'addItem.param1.placeholder',
        options: ITEM_OPTIONS,
      },
      { type: 'text', copyKey: 'addItem.template2' },
      { type: 'param', index: 2, labelKey: 'addItem.param2.label', ui: 'number', placeholderKey: 'addItem.param2.placeholder' },
    ],
  },

  {
    key: 'removeItem',
    category: 'item',
    color: 'yellow',
    icon: 'Package',
    template: [
      { type: 'text', copyKey: 'removeItem.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'removeItem.param1.label',
        ui: 'item',
        placeholderKey: 'removeItem.param1.placeholder',
        options: ITEM_OPTIONS,
      },
    ],
  },

  {
    key: 'money',
    category: 'item',
    color: 'yellow',
    icon: 'Coins',
    template: [
      { type: 'text', copyKey: 'money.template1' },
      { type: 'param', index: 1, labelKey: 'money.param1.label', ui: 'number', placeholderKey: 'money.param1.placeholder' },
    ],
  },

  {
    key: 'itemAboveHead',
    category: 'item',
    color: 'yellow',
    icon: 'ArrowUpCircle',
    template: [
      { type: 'text', copyKey: 'itemAboveHead.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'itemAboveHead.param1.label',
        ui: 'item',
        placeholderKey: 'itemAboveHead.param1.placeholder',
        options: ITEM_OPTIONS,
      },
    ],
  },

  {
    key: 'friendship',
    category: 'item',
    color: 'yellow',
    icon: 'Heart',
    template: [
      { type: 'text', copyKey: 'friendship.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'friendship.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'friendship.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'friendship.template2' },
      { type: 'param', index: 2, labelKey: 'friendship.param2.label', ui: 'number', placeholderKey: 'friendship.param2.placeholder' },
    ],
  },
] satisfies CommandSchema[]
