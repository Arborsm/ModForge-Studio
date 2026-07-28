import { describe, expect, it } from 'vite-plus/test'
import { insertPageAfter, parseDialogueScript, serializeDialogueScript, setPagePortrait, setPageText } from '@entities/dialogue'
import { parseRawArgs, serializeRaw } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/rawSerializer'
import { dialogueCommandSchemas } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/command-schemas/dialogue'
import type { UIControlType } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-model/commandSchema'

/**
 * The `dialogue_script` control writes the serialized script back into one
 * command argument; the event script raw is then rebuilt by joining the scene
 * segments and every command raw with `/`. These tests lock that path so the
 * shared dialogue editor cannot desync from hand-written event raw.
 */

/** Mirrors `editorStore.rebuildScriptRaw`: three scene segments, then commands. */
function rebuildScriptRaw(scene: readonly string[], commandRaws: readonly string[]): string {
  return [...scene, ...commandRaws].join('/')
}

function updateArg(raw: string, argIndex: number, value: string): string {
  const args = parseRawArgs(raw)
  args[argIndex] = value
  return serializeRaw(args)
}

describe('event dialogue bridge', () => {
  it('routes speak / splitSpeak / message text through the dialogue_script control', () => {
    const controls: Array<{ key: string; ui: UIControlType }> = dialogueCommandSchemas.flatMap((schema) =>
      schema.template.filter((item) => item.type === 'param').map((item) => ({ key: schema.key, ui: item.ui })),
    )

    expect(controls.find((entry) => entry.key === 'speak' && entry.ui === 'dialogue_script')).toBeDefined()
    expect(controls.find((entry) => entry.key === 'splitSpeak' && entry.ui === 'dialogue_script')).toBeDefined()
    expect(controls.find((entry) => entry.key === 'message' && entry.ui === 'dialogue_script')).toBeDefined()
    expect(controls.some((entry) => entry.ui === 'textarea')).toBe(false)
  })

  it('writes an edited script back into the command arg and rebuilds the raw event script', () => {
    const scene = ['spring', '30 18', 'farmer 30 20 2 Abigail 32 20 0']
    const speakRaw = 'speak Abigail "Hi there.$h"'
    const commands = [speakRaw, 'end']

    const ast = parseDialogueScript(parseRawArgs(speakRaw)[2] ?? '')
    const withSecondPage = parseDialogueScript(insertPageAfter(ast, 'page:0', '#$e#'))
    const withText = parseDialogueScript(setPageText(withSecondPage, 'page:1', 'See you around.'))
    const nextScript = setPagePortrait(withText, 'page:1', { kind: 'emotion', emotion: 's' })

    expect(nextScript).toBe('Hi there.$h#$e#See you around.$s')

    const nextCommands = [updateArg(speakRaw, 2, nextScript), ...commands.slice(1)]
    expect(rebuildScriptRaw(scene, nextCommands)).toBe(
      'spring/30 18/farmer 30 20 2 Abigail 32 20 0/speak Abigail "Hi there.$h#$e#See you around.$s"/end',
    )
  })

  it('keeps an untouched script byte-identical after a parse/serialize round trip', () => {
    const raw = 'speak Abigail "Wait...#$b#did you hear that?$u"'
    const text = parseRawArgs(raw)[2] ?? ''
    const roundTripped = serializeDialogueScript(parseDialogueScript(text))

    expect(roundTripped).toBe(text)
    expect(updateArg(raw, 2, roundTripped)).toBe(raw)
  })
})
