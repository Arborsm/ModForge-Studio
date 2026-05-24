import type { CommandSchema } from '../commandSchema'

export const mailQuestCommandSchemas = [
  // Mail / Quest

  {
    key: 'mail',
    label: 'Mail',
    labelZh: '邮件',
    category: 'item',
    color: 'yellow',
    icon: 'Mail',
    template: [
      { type: 'text', value: '发送邮件' },
      { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
    ],
  },

  {
    key: 'mailToday',
    label: 'Mail Today',
    labelZh: '今日邮件',
    category: 'item',
    color: 'yellow',
    icon: 'Mail',
    template: [
      { type: 'text', value: '今日发送邮件' },
      { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
    ],
  },

  {
    key: 'mailReceived',
    label: 'Mail Received',
    labelZh: '标记收到邮件',
    category: 'item',
    color: 'yellow',
    icon: 'MailCheck',
    template: [
      { type: 'text', value: '标记已收到邮件' },
      { type: 'param', index: 1, label: '邮件', ui: 'text', placeholder: 'LetterId' },
    ],
  },

  {
    key: 'addQuest',
    label: 'Add Quest',
    labelZh: '添加任务',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', value: '添加任务' },
      { type: 'param', index: 1, label: '任务', ui: 'text', placeholder: 'QuestId' },
    ],
  },

  {
    key: 'removeQuest',
    label: 'Remove Quest',
    labelZh: '移除任务',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', value: '移除任务' },
      { type: 'param', index: 1, label: '任务', ui: 'text', placeholder: 'QuestId' },
    ],
  },

  {
    key: 'addSpecialOrder',
    label: 'Add Special Order',
    labelZh: '添加特殊订单',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', value: '添加特殊订单' },
      { type: 'param', index: 1, label: '订单', ui: 'text', placeholder: 'OrderId' },
    ],
  },

  {
    key: 'removeSpecialOrder',
    label: 'Remove Special Order',
    labelZh: '移除特殊订单',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', value: '移除特殊订单' },
      { type: 'param', index: 1, label: '订单', ui: 'text', placeholder: 'OrderId' },
    ],
  },

  {
    key: 'addCookingRecipe',
    label: 'Add Cooking Recipe',
    labelZh: '添加食谱',
    category: 'item',
    color: 'yellow',
    icon: 'ChefHat',
    template: [
      { type: 'text', value: '添加食谱' },
      { type: 'param', index: 1, label: '食谱', ui: 'text', placeholder: 'RecipeName' },
    ],
  },

  {
    key: 'addCraftingRecipe',
    label: 'Add Crafting Recipe',
    labelZh: '添加配方',
    category: 'item',
    color: 'yellow',
    icon: 'Hammer',
    template: [
      { type: 'text', value: '添加配方' },
      { type: 'param', index: 1, label: '配方', ui: 'text', placeholder: 'RecipeName' },
    ],
  },

  {
    key: 'addConversationTopic',
    label: 'Add Conversation Topic',
    labelZh: '添加话题',
    category: 'item',
    color: 'yellow',
    icon: 'MessageCircle',
    template: [
      { type: 'text', value: '添加话题' },
      { type: 'param', index: 1, label: '话题', ui: 'text', placeholder: 'TopicId' },
      { type: 'text', value: '持续天数' },
      { type: 'param', index: 2, label: '天数', ui: 'number', placeholder: '7' },
    ],
  },
] satisfies CommandSchema[]
