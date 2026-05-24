import type { CommandSchema } from '../commandSchema'
import { MUSIC_OPTIONS, SOUND_OPTIONS } from '../commandOptions'

export const audioCommandSchemas = [
  // Audio

  {
    key: 'playMusic',
    label: 'Play Music',
    labelZh: '播放音乐',
    category: 'audio',
    color: 'purple',
    icon: 'Music',
    template: [
      { type: 'text', value: '播放音乐' },
      { type: 'param', index: 1, label: '音乐', ui: 'music', placeholder: 'musicId', options: MUSIC_OPTIONS },
    ],
  },

  {
    key: 'stopMusic',
    label: 'Stop Music',
    labelZh: '停止音乐',
    category: 'audio',
    color: 'purple',
    icon: 'MusicOff',
    template: [{ type: 'text', value: '停止音乐' }],
  },

  {
    key: 'playSound',
    label: 'Play Sound',
    labelZh: '播放音效',
    category: 'audio',
    color: 'purple',
    icon: 'Volume2',
    template: [
      { type: 'text', value: '播放音效' },
      { type: 'param', index: 1, label: '音效', ui: 'sound', placeholder: 'soundId', options: SOUND_OPTIONS },
    ],
  },

  {
    key: 'stopSound',
    label: 'Stop Sound',
    labelZh: '停止音效',
    category: 'audio',
    color: 'purple',
    icon: 'VolumeX',
    template: [{ type: 'text', value: '停止音效' }],
  },
] satisfies CommandSchema[]
