import type { CommandSchema } from '../commandSchema'

export const mailQuestCommandSchemas = [
  // Mail / Quest

  {
    key: 'mail',
    category: 'item',
    color: 'yellow',
    icon: 'Mail',
    template: [
      { type: 'text', copyKey: 'mail.template1' },
      { type: 'param', index: 1, labelKey: 'mail.param1.label', ui: 'text', placeholderKey: 'mail.param1.placeholder' },
    ],
  },

  {
    key: 'mailToday',
    category: 'item',
    color: 'yellow',
    icon: 'Mail',
    template: [
      { type: 'text', copyKey: 'mailToday.template1' },
      { type: 'param', index: 1, labelKey: 'mailToday.param1.label', ui: 'text', placeholderKey: 'mailToday.param1.placeholder' },
    ],
  },

  {
    key: 'mailReceived',
    category: 'item',
    color: 'yellow',
    icon: 'MailCheck',
    template: [
      { type: 'text', copyKey: 'mailReceived.template1' },
      { type: 'param', index: 1, labelKey: 'mailReceived.param1.label', ui: 'text', placeholderKey: 'mailReceived.param1.placeholder' },
    ],
  },

  {
    key: 'addQuest',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', copyKey: 'addQuest.template1' },
      { type: 'param', index: 1, labelKey: 'addQuest.param1.label', ui: 'text', placeholderKey: 'addQuest.param1.placeholder' },
    ],
  },

  {
    key: 'removeQuest',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', copyKey: 'removeQuest.template1' },
      { type: 'param', index: 1, labelKey: 'removeQuest.param1.label', ui: 'text', placeholderKey: 'removeQuest.param1.placeholder' },
    ],
  },

  {
    key: 'addSpecialOrder',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', copyKey: 'addSpecialOrder.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addSpecialOrder.param1.label',
        ui: 'text',
        placeholderKey: 'addSpecialOrder.param1.placeholder',
      },
    ],
  },

  {
    key: 'removeSpecialOrder',
    category: 'item',
    color: 'yellow',
    icon: 'Scroll',
    template: [
      { type: 'text', copyKey: 'removeSpecialOrder.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'removeSpecialOrder.param1.label',
        ui: 'text',
        placeholderKey: 'removeSpecialOrder.param1.placeholder',
      },
    ],
  },

  {
    key: 'addCookingRecipe',
    category: 'item',
    color: 'yellow',
    icon: 'ChefHat',
    template: [
      { type: 'text', copyKey: 'addCookingRecipe.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addCookingRecipe.param1.label',
        ui: 'text',
        placeholderKey: 'addCookingRecipe.param1.placeholder',
      },
    ],
  },

  {
    key: 'addCraftingRecipe',
    category: 'item',
    color: 'yellow',
    icon: 'Hammer',
    template: [
      { type: 'text', copyKey: 'addCraftingRecipe.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addCraftingRecipe.param1.label',
        ui: 'text',
        placeholderKey: 'addCraftingRecipe.param1.placeholder',
      },
    ],
  },

  {
    key: 'addConversationTopic',
    category: 'item',
    color: 'yellow',
    icon: 'MessageCircle',
    template: [
      { type: 'text', copyKey: 'addConversationTopic.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'addConversationTopic.param1.label',
        ui: 'text',
        placeholderKey: 'addConversationTopic.param1.placeholder',
      },
      { type: 'text', copyKey: 'addConversationTopic.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'addConversationTopic.param2.label',
        ui: 'number',
        placeholderKey: 'addConversationTopic.param2.placeholder',
      },
    ],
  },
] satisfies CommandSchema[]
