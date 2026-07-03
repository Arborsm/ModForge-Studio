import type { CommandSchema } from '../commandSchema'
import { ACTOR_OPTIONS, EMOTE_OPTIONS, FADE_SPEED_OPTIONS, ANIMATION_FRAME_OPTIONS, EYES_OPTIONS } from '../commandOptions'

export const visualCommandSchemas = [
  // Visual

  {
    key: 'emote',
    category: 'visual',
    color: 'pink',
    icon: 'Smile',
    template: [
      { type: 'text', copyKey: 'emote.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'emote.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'emote.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'emote.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'emote.param2.label',
        ui: 'emote',
        placeholderKey: 'emote.param2.placeholder',
        options: EMOTE_OPTIONS,
      },
    ],
    stageMeta: { affectsActorEmotion: true },
  },

  {
    key: 'animate',
    category: 'visual',
    color: 'pink',
    icon: 'PlayCircle',
    template: [
      { type: 'text', copyKey: 'animate.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'animate.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'animate.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'animate.template2' },
      { type: 'param', index: 2, labelKey: 'animate.param2.label', ui: 'toggle', placeholderKey: 'animate.param2.placeholder' },
      { type: 'text', copyKey: 'animate.template3' },
      { type: 'param', index: 3, labelKey: 'animate.param3.label', ui: 'toggle', placeholderKey: 'animate.param3.placeholder' },
      { type: 'text', copyKey: 'animate.template4' },
      { type: 'param', index: 4, labelKey: 'animate.param4.label', ui: 'number', placeholderKey: 'animate.param4.placeholder' },
      { type: 'text', copyKey: 'animate.template5' },
      { type: 'param', index: 5, labelKey: 'animate.param5.label', ui: 'animation_frames', placeholderKey: 'animate.param5.placeholder' },
    ],
  },

  {
    key: 'stopAnimation',
    category: 'visual',
    color: 'pink',
    icon: 'Square',
    template: [
      { type: 'text', copyKey: 'stopAnimation.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'stopAnimation.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'stopAnimation.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'stopAnimation.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'stopAnimation.param2.label',
        ui: 'choice',
        placeholderKey: 'stopAnimation.param2.placeholder',
        options: ANIMATION_FRAME_OPTIONS,
      },
    ],
  },

  {
    key: 'showFrame',
    category: 'visual',
    color: 'pink',
    icon: 'Image',
    template: [
      { type: 'text', copyKey: 'showFrame.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'showFrame.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'showFrame.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'showFrame.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'showFrame.param2.label',
        ui: 'choice',
        placeholderKey: 'showFrame.param2.placeholder',
        options: ANIMATION_FRAME_OPTIONS,
      },
    ],
  },

  {
    key: 'changeSprite',
    category: 'visual',
    color: 'pink',
    icon: 'Image',
    template: [
      { type: 'text', copyKey: 'changeSprite.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'changeSprite.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'changeSprite.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'changeSprite.template2' },
      { type: 'param', index: 2, labelKey: 'changeSprite.param2.label', ui: 'text', placeholderKey: 'changeSprite.param2.placeholder' },
    ],
  },

  {
    key: 'changePortrait',
    category: 'visual',
    color: 'pink',
    icon: 'User',
    template: [
      { type: 'text', copyKey: 'changePortrait.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'changePortrait.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'changePortrait.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'changePortrait.template2' },
      { type: 'param', index: 2, labelKey: 'changePortrait.param2.label', ui: 'text', placeholderKey: 'changePortrait.param2.placeholder' },
    ],
  },

  {
    key: 'eyes',
    category: 'visual',
    color: 'pink',
    icon: 'Eye',
    template: [
      { type: 'text', copyKey: 'eyes.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'eyes.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'eyes.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'eyes.template2' },
      {
        type: 'param',
        index: 2,
        labelKey: 'eyes.param2.label',
        ui: 'choice',
        placeholderKey: 'eyes.param2.placeholder',
        options: EYES_OPTIONS,
      },
    ],
  },

  {
    key: 'swimming',
    category: 'visual',
    color: 'pink',
    icon: 'Waves',
    template: [
      { type: 'text', copyKey: 'swimming.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'swimming.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'swimming.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'swimming.template2' },
    ],
  },

  {
    key: 'stopSwimming',
    category: 'visual',
    color: 'pink',
    icon: 'Waves',
    template: [
      { type: 'text', copyKey: 'stopSwimming.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'stopSwimming.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'stopSwimming.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'stopSwimming.template2' },
    ],
  },

  {
    key: 'glow',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', copyKey: 'glow.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'glow.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'glow.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'glow.template2' },
    ],
  },

  {
    key: 'stopGlowing',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', copyKey: 'stopGlowing.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'stopGlowing.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'stopGlowing.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'stopGlowing.template2' },
    ],
  },

  {
    key: 'setRunning',
    category: 'visual',
    color: 'pink',
    icon: 'Footprints',
    template: [
      { type: 'text', copyKey: 'setRunning.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'setRunning.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'setRunning.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'setRunning.template2' },
    ],
  },

  {
    key: 'stopRunning',
    category: 'visual',
    color: 'pink',
    icon: 'Footprints',
    template: [
      { type: 'text', copyKey: 'stopRunning.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'stopRunning.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'stopRunning.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'stopRunning.template2' },
    ],
  },

  {
    key: 'startJittering',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', copyKey: 'startJittering.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'startJittering.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'startJittering.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'startJittering.template2' },
    ],
  },

  {
    key: 'stopJittering',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', copyKey: 'stopJittering.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'stopJittering.param1.label',
        ui: 'npc_selector',
        placeholderKey: 'stopJittering.param1.placeholder',
        options: ACTOR_OPTIONS,
      },
      { type: 'text', copyKey: 'stopJittering.template2' },
    ],
  },

  {
    key: 'shake',
    category: 'visual',
    color: 'pink',
    icon: 'Vibrate',
    template: [
      { type: 'text', copyKey: 'shake.template1' },
      { type: 'param', index: 1, labelKey: 'shake.param1.label', ui: 'number', placeholderKey: 'shake.param1.placeholder' },
    ],
  },

  {
    key: 'fade',
    category: 'visual',
    color: 'pink',
    icon: 'Moon',
    template: [
      { type: 'text', copyKey: 'fade.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'fade.param1.label',
        ui: 'choice',
        placeholderKey: 'fade.param1.placeholder',
        options: FADE_SPEED_OPTIONS,
      },
    ],
  },

  {
    key: 'globalFade',
    category: 'visual',
    color: 'pink',
    icon: 'Moon',
    template: [
      { type: 'text', copyKey: 'globalFade.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'globalFade.param1.label',
        ui: 'choice',
        placeholderKey: 'globalFade.param1.placeholder',
        options: FADE_SPEED_OPTIONS,
      },
    ],
  },

  {
    key: 'globalFadeToClear',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', copyKey: 'globalFadeToClear.template1' },
      {
        type: 'param',
        index: 1,
        labelKey: 'globalFadeToClear.param1.label',
        ui: 'choice',
        placeholderKey: 'globalFadeToClear.param1.placeholder',
        options: FADE_SPEED_OPTIONS,
      },
    ],
  },

  {
    key: 'screenFlash',
    category: 'visual',
    color: 'pink',
    icon: 'Zap',
    template: [{ type: 'text', copyKey: 'screenFlash.template1' }],
  },

  {
    key: 'ambientLight',
    category: 'visual',
    color: 'pink',
    icon: 'Sun',
    template: [
      { type: 'text', copyKey: 'ambientLight.template1' },
      { type: 'param', index: 1, labelKey: 'ambientLight.param1.label', ui: 'number', placeholderKey: 'ambientLight.param1.placeholder' },
      { type: 'param', index: 2, labelKey: 'ambientLight.param2.label', ui: 'number', placeholderKey: 'ambientLight.param2.placeholder' },
      { type: 'param', index: 3, labelKey: 'ambientLight.param3.label', ui: 'number', placeholderKey: 'ambientLight.param3.placeholder' },
    ],
  },
] satisfies CommandSchema[]
