import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS } from '../commandOptions'

export const otherCommandSchemas = [
  // Other

  {
    key: 'textAboveHead',
    category: 'other',
    color: 'gray',
    icon: 'Type',
    template: [
      { type: 'text', copyKey: 'textAboveHead.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'textAboveHead.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'textAboveHead.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'textAboveHead.template2' },
      { type: 'param', index: 2, labelKey: 'textAboveHead.param2.label', ui: 'text', placeholderKey: 'textAboveHead.param2.placeholder' },
    ],
  },

  {
    key: 'playerControl',
    category: 'other',
    color: 'gray',
    icon: 'Gamepad2',
    template: [{ type: 'text', copyKey: 'playerControl.template1' }],
  },

  {
    key: 'halt',
    category: 'other',
    color: 'gray',
    icon: 'Octagon',
    template: [{ type: 'text', copyKey: 'halt.template1' }],
  },

  {
    key: 'ignoreMovementAnimation',
    category: 'other',
    color: 'gray',
    icon: 'EyeOff',
    template: [
      { type: 'text', copyKey: 'ignoreMovementAnimation.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'ignoreMovementAnimation.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'ignoreMovementAnimation.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'ignoreMovementAnimation.template2' },
    ],
  },

  {
    key: 'ignoreCollisions',
    category: 'other',
    color: 'gray',
    icon: 'EyeOff',
    template: [
      { type: 'text', copyKey: 'ignoreCollisions.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'ignoreCollisions.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'ignoreCollisions.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'ignoreCollisions.template2' },
    ],
  },

  {
    key: 'doAction',
    category: 'other',
    color: 'gray',
    icon: 'MousePointerClick',
    template: [
      { type: 'text', copyKey: 'doAction.template1' },
      { type: 'param', index: 1, labelKey: 'doAction.param1.label', ui: 'tile_picker', placeholderKey: 'doAction.param1.placeholder' },
      { type: 'text', value: ',' },
      { type: 'param', index: 2, labelKey: 'doAction.param2.label', ui: 'tile_picker', placeholderKey: 'doAction.param2.placeholder' },
      { type: 'text', copyKey: 'doAction.template2' },
    ],
  },
] satisfies CommandSchema[]
