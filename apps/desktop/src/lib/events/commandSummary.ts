import type { EventCommand } from './types'
import { getEventCommandTitle } from './commandCatalog'

export type CommandSummary = {
  icon: string
  title: string
  subtitle: string
  timing?: string
}

function getDirectionName(dir: number): string {
  switch (dir) {
    case 0:
      return '上'
    case 1:
      return '右'
    case 2:
      return '下'
    case 3:
      return '左'
    default:
      return `方向${dir}`
  }
}

function getEmoteName(index: number): string {
  const emotes: Record<number, string> = {
    0: 'question',
    1: 'angry',
    2: 'exclamation',
    3: 'heart',
    4: 'sleep',
    5: 'sad',
    6: 'happy',
    7: 'x',
    8: 'pause',
    9: 'music',
    10: 'blush',
    11: 'blank',
    12: 'umani',
  }
  return emotes[index] ?? `emote ${index}`
}

function truncate(text: string, max = 60): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

function stripQuotes(value: string): string {
  const t = value.trim()
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1)
  }
  return t
}

export function getCommandSummary(cmd: EventCommand): CommandSummary {
  const args = cmd.args

  switch (cmd.command) {
    case 'speak':
    case 'splitSpeak': {
      const actor = args[1] ?? ''
      const text = cmd.text ?? stripQuotes(args[2] ?? '')
      return {
        icon: 'MessageSquareText',
        title: actor || getEventCommandTitle(cmd.command),
        subtitle: text ? truncate(`"${text}"`) : '',
      }
    }

    case 'message': {
      const text = cmd.text ?? stripQuotes(args[1] ?? '')
      return {
        icon: 'MessageSquareText',
        title: 'Message',
        subtitle: text ? truncate(`"${text}"`) : '',
      }
    }

    case 'move': {
      const actor = args[1] ?? ''
      let steps = 0
      for (let i = 1; i + 3 < args.length; i += 4) {
        const dx = Number.parseInt(args[i + 1] ?? '0', 10) || 0
        const dy = Number.parseInt(args[i + 2] ?? '0', 10) || 0
        steps += Math.abs(dx) + Math.abs(dy)
      }
      return {
        icon: 'ArrowRightLeft',
        title: actor || 'Move',
        subtitle: steps > 0 ? `移动 ${steps} 格` : '移动',
      }
    }

    case 'warp': {
      const actor = args[1] ?? ''
      const x = args[2] ?? '?'
      const y = args[3] ?? '?'
      return {
        icon: 'MapPin',
        title: actor || 'Warp',
        subtitle: `→ (${x}, ${y})`,
      }
    }

    case 'pause': {
      const ms = Number.parseInt(args[1] ?? '0', 10)
      const s = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
      return {
        icon: 'TimerReset',
        title: 'Pause',
        subtitle: s,
        timing: s,
      }
    }

    case 'waitForAllStationary':
      return {
        icon: 'TimerReset',
        title: 'Wait',
        subtitle: '等待移动结束',
        timing: 'wait all',
      }

    case 'waitForOtherPlayers':
      return {
        icon: 'TimerReset',
        title: 'Wait',
        subtitle: '等待其他玩家',
        timing: 'wait players',
      }

    case 'emote': {
      const actor = args[1] ?? ''
      const emoteIdx = Number.parseInt(args[2] ?? '', 10)
      return {
        icon: 'Smile',
        title: actor || 'Emote',
        subtitle: getEmoteName(emoteIdx),
      }
    }

    case 'faceDirection': {
      const actor = args[1] ?? ''
      const dir = Number.parseInt(args[2] ?? '', 10)
      return {
        icon: 'Compass',
        title: actor || 'Face',
        subtitle: `面向${getDirectionName(dir)}`,
      }
    }

    case 'playMusic': {
      const music = args[1] ?? ''
      return {
        icon: 'Music',
        title: 'Music',
        subtitle: stripQuotes(music),
      }
    }

    case 'stopMusic':
      return {
        icon: 'Music',
        title: 'Music',
        subtitle: '停止',
      }

    case 'playSound': {
      const sound = args[1] ?? ''
      return {
        icon: 'Volume2',
        title: 'Sound',
        subtitle: stripQuotes(sound),
      }
    }

    case 'stopSound':
      return {
        icon: 'Volume2',
        title: 'Sound',
        subtitle: '停止',
      }

    case 'viewport': {
      const x = args[1] ?? '?'
      const y = args[2] ?? '?'
      return {
        icon: 'Map',
        title: 'Viewport',
        subtitle: `(${x}, ${y})`,
      }
    }

    case 'changeLocation': {
      const loc = args[1] ?? ''
      return {
        icon: 'Map',
        title: 'Location',
        subtitle: stripQuotes(loc),
      }
    }

    case 'animate': {
      const actor = args[1] ?? ''
      return {
        icon: 'PlayCircle',
        title: actor || 'Animate',
        subtitle: '播放动画',
      }
    }

    case 'stopAnimation': {
      const actor = args[1] ?? ''
      return {
        icon: 'PlayCircle',
        title: actor || 'Stop Animate',
        subtitle: '停止动画',
      }
    }

    case 'showFrame': {
      const actor = args[1] ?? ''
      const frame = args[2] ?? '?'
      return {
        icon: 'PlayCircle',
        title: actor || 'Frame',
        subtitle: `帧 ${frame}`,
      }
    }

    case 'positionOffset': {
      const actor = args[1] ?? ''
      const x = args[2] ?? '?'
      const y = args[3] ?? '?'
      return {
        icon: 'Move',
        title: actor || 'Offset',
        subtitle: `偏移 (${x}, ${y})`,
      }
    }

    case 'addTemporaryActor': {
      const actor = args[1] ?? ''
      return {
        icon: 'UserPlus',
        title: 'Add Actor',
        subtitle: stripQuotes(actor),
      }
    }

    case 'friendship': {
      const actor = args[1] ?? ''
      const amount = args[2] ?? ''
      return {
        icon: 'Heart',
        title: actor || 'Friendship',
        subtitle: amount ? `+${amount}` : '',
      }
    }

    case 'globalFade':
    case 'globalFadeToClear': {
      return {
        icon: 'Sun',
        title: cmd.command === 'globalFade' ? 'Fade Out' : 'Fade In',
        subtitle: '',
      }
    }

    case 'fade': {
      return {
        icon: 'Sun',
        title: 'Fade',
        subtitle: '',
      }
    }

    case 'question':
    case 'quickQuestion': {
      const prompt = cmd.prompt ?? stripQuotes(args[1] ?? '')
      const choices = cmd.choices?.length ?? 0
      return {
        icon: 'ListChecks',
        title: 'Question',
        subtitle: prompt ? truncate(prompt) : choices > 0 ? `${choices} 个选项` : '',
      }
    }

    case 'fork': {
      const condition = args[1] ?? ''
      return {
        icon: 'GitBranch',
        title: 'Fork',
        subtitle: condition ? `条件: ${stripQuotes(condition)}` : '',
      }
    }

    case 'switchEvent': {
      const target = args[1] ?? ''
      return {
        icon: 'GitBranch',
        title: 'Switch Event',
        subtitle: stripQuotes(target),
      }
    }

    case 'end':
      return {
        icon: 'Octagon',
        title: 'End',
        subtitle: '事件结束',
      }

    case 'beginSimultaneousCommand':
      return {
        icon: 'Layers',
        title: 'Simultaneous',
        subtitle: '开始并行',
      }

    case 'endSimultaneousCommand':
      return {
        icon: 'Layers',
        title: 'Simultaneous',
        subtitle: '结束并行',
      }

    case 'jump': {
      const actor = args[1] ?? ''
      return {
        icon: 'ArrowUp',
        title: actor || 'Jump',
        subtitle: '跳跃',
      }
    }

    case 'shake': {
      const duration = args[1] ?? ''
      return {
        icon: 'Vibrate',
        title: 'Shake',
        subtitle: duration ? `${duration}ms` : '',
      }
    }

    case 'screenFlash': {
      return {
        icon: 'Zap',
        title: 'Flash',
        subtitle: '',
      }
    }

    case 'money': {
      const amount = args[1] ?? ''
      const v = Number.parseInt(amount, 10)
      return {
        icon: 'Coins',
        title: 'Money',
        subtitle: `${v >= 0 ? '+' : ''}${amount}`,
      }
    }

    case 'addItem': {
      const item = args[1] ?? ''
      return {
        icon: 'Package',
        title: 'Item',
        subtitle: stripQuotes(item),
      }
    }

    case 'removeItem': {
      const item = args[1] ?? ''
      return {
        icon: 'Package',
        title: 'Remove Item',
        subtitle: stripQuotes(item),
      }
    }

    default: {
      const detail = cmd.detail || ''
      return {
        icon: 'CircleDot',
        title: cmd.title || getEventCommandTitle(cmd.command),
        subtitle: truncate(detail, 50),
      }
    }
  }
}
