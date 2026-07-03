import type { CommandSchema } from '../commandSchema'
import { MUSIC_OPTIONS, SOUND_OPTIONS } from '../commandOptions'

export const audioCommandSchemas = [
  // Audio

  {
    key: 'playMusic',
    category: 'audio',
    color: 'purple',
    icon: 'Music',
    template: [
      { type: 'text', copyKey: 'playMusic.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'playMusic.param1.label',
        ui: 'music',
        placeholderKey: 'playMusic.param1.placeholder',
        options: MUSIC_OPTIONS,
      },
    ],
  },

  {
    key: 'stopMusic',
    category: 'audio',
    color: 'purple',
    icon: 'MusicOff',
    template: [{ type: 'text', copyKey: 'stopMusic.template1' }],
  },

  {
    key: 'playSound',
    category: 'audio',
    color: 'purple',
    icon: 'Volume2',
    template: [
      { type: 'text', copyKey: 'playSound.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'playSound.param1.label',
        ui: 'sound',
        placeholderKey: 'playSound.param1.placeholder',
        options: SOUND_OPTIONS,
      },
    ],
  },

  {
    key: 'stopSound',
    category: 'audio',
    color: 'purple',
    icon: 'VolumeX',
    template: [{ type: 'text', copyKey: 'stopSound.template1' }],
  },
] satisfies CommandSchema[]
