import { describe, expect, test } from 'vite-plus/test'
import { parseEventCommand } from './parser'

describe('event parser dialogue markup', () => {
  test('parses vanilla embedded dialogue questions without leaking control tokens into dialogue pages', () => {
    const command = parseEventCommand(
      'speak Elliott "$q 958699 null#问个问题......你喜欢什么样的书，@？#$r 958699 30 event_idea1#悬念#$r 958700 30 event_idea2#浪漫#$r 958701 30 event_idea3#科幻"',
      0,
    )

    expect(command.embeddedQuestion?.prompt).toBe('问个问题......你喜欢什么样的书，@？')
    expect(command.embeddedQuestion?.choices.map((choice) => choice.label)).toEqual(['悬念', '浪漫', '科幻'])
    expect(command.dialoguePages).toEqual([])
  })

  test('parses quickQuestion choices and branch commands from quoted break payloads', () => {
    const command = parseEventCommand(
      'quickQuestion "Hold the lantern?#Yes#No(break)glow farmer\\message You steady the light.(break)screenFlash"',
      0,
    )

    expect(command.prompt).toBe('Hold the lantern?')
    expect(command.choices?.map((choice) => choice.label)).toEqual(['Yes', 'No'])
    expect(command.choices?.[0]?.branchRawCommands).toEqual(['glow farmer', 'message You steady the light.'])
    expect(command.choices?.[1]?.branchRawCommands).toEqual(['screenFlash'])
  })

  test('parses legacy quickQuestion backslash branches without folding them into the prompt', () => {
    const command = parseEventCommand('quickQuestion "Hold the lantern?#Yes#No\\glow farmer\\screenFlash"', 0)

    expect(command.prompt).toBe('Hold the lantern?')
    expect(command.choices?.map((choice) => choice.label)).toEqual(['Yes', 'No'])
    expect(command.choices?.[0]?.branchRawCommands).toEqual(['glow farmer'])
    expect(command.choices?.[1]?.branchRawCommands).toEqual(['screenFlash'])
  })
})
