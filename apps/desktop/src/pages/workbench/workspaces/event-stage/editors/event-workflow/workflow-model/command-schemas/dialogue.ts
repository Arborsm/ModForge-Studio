import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, END_MODE_OPTIONS } from '../commandOptions'

export const dialogueCommandSchemas = [
  // Dialogue

  {
    key: 'speak',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquareText',
    template: [
      { type: 'text', copyKey: 'speak.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'speak.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'speak.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'speak.template2' },
      { type: 'param', index: 2, labelKey: 'speak.param2.label', ui: 'textarea', placeholderKey: 'speak.param2.placeholder' },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'splitSpeak',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquareText',
    template: [
      { type: 'text', copyKey: 'splitSpeak.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'splitSpeak.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'splitSpeak.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'splitSpeak.template2' },
      { type: 'param', index: 2, labelKey: 'splitSpeak.param2.label', ui: 'textarea', placeholderKey: 'splitSpeak.param2.placeholder' },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'message',
    category: 'dialogue',
    color: 'blue',
    icon: 'MessageSquare',
    template: [
      { type: 'text', copyKey: 'message.template1' },
      { type: 'param', index: 1, labelKey: 'message.param1.label', ui: 'textarea', placeholderKey: 'message.param1.placeholder' },
    ],
  },

  {
    key: 'end',
    category: 'dialogue',
    color: 'gray',
    icon: 'Octagon',
    template: [
      { type: 'text', copyKey: 'end.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'end.param1.label',
        ui: 'choice',
        placeholderKey: 'end.param1.placeholder',
        options: END_MODE_OPTIONS,
      },
    ],
  },
] satisfies CommandSchema[]
