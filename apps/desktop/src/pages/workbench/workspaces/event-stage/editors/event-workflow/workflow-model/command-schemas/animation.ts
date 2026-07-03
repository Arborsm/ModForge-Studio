import type { CommandSchema } from '../commandSchema'
import { FARMER_ANIMATION_OPTIONS, ITEM_OPTIONS } from '../commandOptions'

export const animationCommandSchemas = [
  // Animation

  {
    key: 'farmerAnimation',
    category: 'animation',
    color: 'red',
    icon: 'User',
    template: [
      { type: 'text', copyKey: 'farmerAnimation.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'farmerAnimation.param1.label',
        ui: 'choice',
        placeholderKey: 'farmerAnimation.param1.placeholder',
        options: FARMER_ANIMATION_OPTIONS,
      },
    ],
  },

  {
    key: 'farmerEat',
    category: 'animation',
    color: 'red',
    icon: 'User',
    template: [
      { type: 'text', copyKey: 'farmerEat.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'farmerEat.param1.label',
        ui: 'item',
        placeholderKey: 'farmerEat.param1.placeholder',
        options: ITEM_OPTIONS,
      },
    ],
  },
] satisfies CommandSchema[]
