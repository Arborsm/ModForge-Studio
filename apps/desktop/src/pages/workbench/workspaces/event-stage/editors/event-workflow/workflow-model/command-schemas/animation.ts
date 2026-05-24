import type { CommandSchema } from '../commandSchema'
import { FARMER_ANIMATION_OPTIONS } from '../commandOptions'

export const animationCommandSchemas = [
  // Animation

  {
    key: 'farmerAnimation',
    label: 'Farmer Animation',
    labelZh: '玩家动画',
    category: 'animation',
    color: 'red',
    icon: 'User',
    template: [
      { type: 'text', value: '玩家动画' },
      { type: 'param', index: 1, label: '动画', ui: 'number', placeholder: '0-7', options: FARMER_ANIMATION_OPTIONS },
    ],
  },

  {
    key: 'farmerEat',
    label: 'Farmer Eat',
    labelZh: '玩家进食',
    category: 'animation',
    color: 'red',
    icon: 'User',
    template: [
      { type: 'text', value: '玩家进食' },
      { type: 'param', index: 1, label: '物品', ui: 'text', placeholder: 'ItemId' },
    ],
  },
] satisfies CommandSchema[]
