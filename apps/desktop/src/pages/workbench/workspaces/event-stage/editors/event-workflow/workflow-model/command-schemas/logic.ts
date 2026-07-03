import type { CommandSchema } from '../commandSchema'

export const logicCommandSchemas = [
  // Logic / Choice

  {
    key: 'question',
    label: 'Question',
    category: 'logic',
    color: 'orange',
    icon: 'ListChecks',
    template: [
      { type: 'text', value: '提问:' },
      { type: 'param', index: 1, label: '键', ui: 'text', placeholder: 'questionKey' },
      { type: 'text', value: '选项:' },
      { type: 'param', index: 2, label: '选项', ui: 'textarea', placeholder: '选项1#选项2#选项3' },
    ],
  },

  {
    key: 'quickQuestion',
    label: 'Quick Question',
    category: 'logic',
    color: 'orange',
    icon: 'GitBranch',
    template: [
      { type: 'text', value: '快速选择:' },
      {
        type: 'param',
        index: 1,
        label: '问题和分支',
        ui: 'quick_question',
        placeholder: '问题#Yes#No\\yesCommand\\noCommand',
      },
    ],
  },

  {
    key: 'fork',
    label: 'Fork',
    category: 'logic',
    color: 'orange',
    icon: 'GitFork',
    template: [
      { type: 'text', value: '如果' },
      { type: 'param', index: 1, label: '条件', ui: 'text', placeholder: 'flagId' },
      { type: 'text', value: '则跳转至' },
      { type: 'param', index: 2, label: '目标', ui: 'text', placeholder: 'eventKey' },
    ],
  },

  {
    key: 'switchEvent',
    label: 'Switch Event',
    category: 'logic',
    color: 'orange',
    icon: 'ArrowRightLeft',
    template: [
      { type: 'text', value: '切换至事件' },
      { type: 'param', index: 1, label: '目标', ui: 'text', placeholder: 'eventKey' },
    ],
  },

  {
    key: 'pause',
    label: 'Pause',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [
      { type: 'text', value: '暂停' },
      { type: 'param', index: 1, label: '毫秒', ui: 'number', placeholder: '1000' },
    ],
  },

  {
    key: 'waitForAllStationary',
    label: 'Wait For All Stationary',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [{ type: 'text', value: '等待所有角色静止' }],
  },

  {
    key: 'waitForOtherPlayers',
    label: 'Wait For Other Players',
    category: 'logic',
    color: 'yellow',
    icon: 'Timer',
    template: [{ type: 'text', value: '等待其他玩家' }],
  },

  {
    key: 'beginSimultaneousCommand',
    label: 'Begin Simultaneous',
    category: 'logic',
    color: 'yellow',
    icon: 'Layers',
    template: [{ type: 'text', value: '开始同步执行' }],
  },

  {
    key: 'endSimultaneousCommand',
    label: 'End Simultaneous',
    category: 'logic',
    color: 'yellow',
    icon: 'Layers',
    template: [{ type: 'text', value: '结束同步执行' }],
  },

  {
    key: 'skippable',
    label: 'Skippable',
    category: 'logic',
    color: 'yellow',
    icon: 'FastForward',
    template: [{ type: 'text', value: '标记以下为可跳过' }],
  },
] satisfies CommandSchema[]
