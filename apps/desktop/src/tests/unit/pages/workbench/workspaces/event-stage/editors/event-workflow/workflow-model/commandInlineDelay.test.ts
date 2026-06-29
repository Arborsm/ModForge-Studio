import { describe, expect, it } from 'vite-plus/test'
import type { EventCommand } from '@entities/event'
import {
  getInlineDelayCandidate,
  getVisiblePlaybackCommandIndex,
  shouldFoldPauseIntoPrevious,
} from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/commandInlineDelay'

function command(raw: string, index: number): EventCommand {
  const args = raw.split(/\s+/u)
  return {
    id: `cmd:${index}`,
    index,
    raw,
    command: args[0] ?? '',
    args,
    kind: args[0] === 'pause' ? 'timing' : 'action',
    title: args[0] ?? '',
    detail: '',
  }
}

describe('commandInlineDelay', () => {
  it('uses vanilla micro delay defaults for positionOffset frame steps', () => {
    const candidate = getInlineDelayCandidate([command('positionOffset Jas -2 1', 0)], 0)

    expect(candidate).toMatchObject({
      defaultMs: 50,
      valueMs: 50,
      stepMs: 5,
      kind: 'step',
      quickValues: [10, 25, 30, 50, 100],
    })
  })

  it('uses vanilla reaction defaults for speak and folds the following pause', () => {
    const commands = [command('speak Shane "..."', 0), command('pause 500', 1)]

    expect(getInlineDelayCandidate(commands, 0)).toMatchObject({
      pauseCommandIndex: 1,
      valueMs: 500,
      defaultMs: 500,
      stepMs: 100,
      kind: 'after',
    })
    expect(shouldFoldPauseIntoPrevious(commands, 1)).toBe(true)
  })

  it('uses longer hold defaults for viewport pauses', () => {
    const candidate = getInlineDelayCandidate([command('viewport 8 4 true', 0)], 0)

    expect(candidate).toMatchObject({
      defaultMs: 2000,
      stepMs: 250,
      kind: 'hold',
      quickValues: [1000, 1500, 2000, 3000, 5000],
    })
  })

  it('does not fold pause after commands without an inline delay policy', () => {
    const commands = [command('end', 0), command('pause 500', 1)]

    expect(getInlineDelayCandidate(commands, 0)).toBeNull()
    expect(shouldFoldPauseIntoPrevious(commands, 1)).toBe(false)
  })

  it('maps playback on a folded pause back to the visible host card', () => {
    const commands = [command('speak Shane "..."', 0), command('pause 500', 1), command('end', 2)]

    expect(getVisiblePlaybackCommandIndex(commands, 'cmd:1')).toBe(0)
    expect(getVisiblePlaybackCommandIndex(commands, 'cmd:2')).toBe(2)
  })
})
