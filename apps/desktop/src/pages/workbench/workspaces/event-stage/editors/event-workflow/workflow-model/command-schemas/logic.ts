import type { CommandSchema } from '../commandSchema'

export const logicCommandSchemas = [
  // Logic / Choice

  {
    key: 'question',
    category: 'logic',
    color: 'orange',
    icon: 'ListChecks',
    template: [
      { type: 'text', copyKey: 'question.template1' },
      { type: 'param', index: 1, labelKey: 'question.param1.label', ui: 'text', placeholderKey: 'question.param1.placeholder' },
      { type: 'text', copyKey: 'question.template2' },
      { type: 'param', index: 2, labelKey: 'question.param2.label', ui: 'textarea', placeholderKey: 'question.param2.placeholder' },
    ],
  },

  {
    key: 'quickQuestion',
    category: 'logic',
    color: 'orange',
    icon: 'GitBranch',
    template: [
      { type: 'text', copyKey: 'quickQuestion.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'quickQuestion.param1.label',
        ui: 'quick_question',
        placeholderKey: 'quickQuestion.param1.placeholder',
      },
    ],
  },

  {
    key: 'fork',
    category: 'logic',
    color: 'orange',
    icon: 'GitFork',
    template: [
      { type: 'text', copyKey: 'fork.template1' },
      { type: 'param', index: 1, labelKey: 'fork.param1.label', ui: 'text', placeholderKey: 'fork.param1.placeholder' },
      { type: 'text', copyKey: 'fork.template2' },
      { type: 'param', index: 2, labelKey: 'fork.param2.label', ui: 'text', placeholderKey: 'fork.param2.placeholder' },
    ],
  },

  {
    key: 'switchEvent',
    category: 'logic',
    color: 'orange',
    icon: 'ArrowRightLeft',
    template: [
      { type: 'text', copyKey: 'switchEvent.template1' },
      { type: 'param', index: 1, labelKey: 'switchEvent.param1.label', ui: 'text', placeholderKey: 'switchEvent.param1.placeholder' },
    ],
  },

  {
    key: 'pause',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [
      { type: 'text', copyKey: 'pause.template1' },
      { type: 'param', index: 1, labelKey: 'pause.param1.label', ui: 'number', placeholderKey: 'pause.param1.placeholder' },
    ],
  },

  {
    key: 'waitForAllStationary',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [{ type: 'text', copyKey: 'waitForAllStationary.template1' }],
  },

  {
    key: 'waitForOtherPlayers',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [{ type: 'text', copyKey: 'waitForOtherPlayers.template1' }],
  },

  {
    key: 'beginSimultaneousCommand',
    category: 'logic',
    color: 'yellow',
    icon: 'Layers',
    template: [{ type: 'text', copyKey: 'beginSimultaneousCommand.template1' }],
  },

  {
    key: 'endSimultaneousCommand',
    category: 'logic',
    color: 'yellow',
    icon: 'Layers',
    template: [{ type: 'text', copyKey: 'endSimultaneousCommand.template1' }],
  },

  {
    key: 'skippable',
    category: 'logic',
    color: 'yellow',
    icon: 'FastForward',
    template: [{ type: 'text', copyKey: 'skippable.template1' }],
  },
] satisfies CommandSchema[]
