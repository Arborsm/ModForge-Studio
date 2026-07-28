import { describe, expect, it } from 'vite-plus/test'
import {
  attachQuestion,
  insertPageAfter,
  parseDialogueScript,
  removePage,
  serializeDialogueScript,
  setPagePortrait,
  setPageSeparator,
  setPageText,
  setSegmentPortrait,
  setSegmentText,
  updateCommandSegment,
  updateQuestionFields,
  updateQuestionResponse,
} from '@entities/dialogue'

/** Verbatim strings from the shipped 1.6 English dialogue assets. */
const VANILLA_FIXTURES: Record<string, string> = {
  // Abigail
  Introduction:
    "Oh, that's right... I heard someone new was moving onto that old farm.#$e#It's kind of a shame, really. I always enjoyed exploring those overgrown fields by myself.$9",
  AcceptBirthdayGift_Negative: "Hey, you remembered my birthday... Thanks, @!$h#$b#Oh, it's, uh... *sniff*... what is it?$s",
  'AcceptGift_(O)66': "$c 0.5#Wow... it's just my color! Thanks, @!$h#Thank you! This is my favorite stone. It's so pretty.",
  Sun2: 'I wonder what would happen if I spent all night in the graveyard?#$q 17/18 Sun_old#@, what do you think happens to us after we die?#$r 17 0 Sun_17#I have no idea.#$r 18 40 Sun_18#We come back as spooky ghosts.#$r 17 0 Sun_17#We go to Heaven.#$r 18 0 Sun_17#Our energy bodies enter the astral plane.#$r 17 30 Sun_nothing#Nothing. We just cease to exist.',
  Sun_old: '$p 17#I guess you think nothing would happen, right?$u|Maybe a wicked ghost would appear!',
  fall_Tue:
    "$d joja#I try to help out in the shop on most days. Business has been pretty bad since the Joja Mart opened, though.|Ever since Joja Mart shut down we've been doing great at the shop!$h",
  Thu: "#$1 Abigail1#Oh no, I think my Dad's going to cook dinner tonight...$s#$e#I don't feel like doing anything today...$u",
  summer_Tue4: "You're an interesting ${guy^lady}$, @. I'm glad you moved here.$h",
  Mon8: "$query PLAYER_NPC_RELATIONSHIP current any married roommate#I remember when you first arrived in town, I was a little sad that those old woods would be turned into farmland. But now I'm really glad you moved here!$h|...Oh, @! Hi.$h#$e#Want to hang out for a while? Here! Let me read your palm. *giggle*$h",
  fall_Thu:
    "#$1 AbigailHAND#Last night I dreamt that my left hand had turned into a gigantic %noun. Does that mean anything?#$e#%Abigail doesn't seem to be interested in talking right now.",
  Event_Grave3:
    "Oh, it's because I'm a girl... isn't it? Ugh...$u^Why? I'm just as strong as you!$a#$b#I'm not some fragile princess.. I can take care of myself!$a#$b#I've lived in the valley my whole life, but I've never really done anything memorable. I want to go on an adventure!$8",
  Fri: "Wow, I just realized it's Friday. $u#$e#Sometimes I totally lose track of time.",
  // Caroline
  houseUpgrade_1:
    "$y 'I heard you got a new kitchen! Think you'll be doing a lot of cooking?_I plan to!_It's a good skill to have. And with all those fresh ingredients on your farm, you'll be sitting pretty!_Nah, it's just for looks_I see. Well, don't forget to eat right... nutrition is important.'",
  // Elliott
  Thu8: "#$1 elliottApol#It's a little lonely out here on the beach... so I apologize if I was ever a little too forward with you when we first met. I was just eager to have a friend.$k#$e#It feels good to have a close friend like you.",
}

describe('dialogue script AST', () => {
  it('round-trips every vanilla fixture byte-for-byte', () => {
    for (const [key, script] of Object.entries(VANILLA_FIXTURES)) {
      const ast = parseDialogueScript(script)
      expect(serializeDialogueScript(ast), key).toBe(script)
    }
  })

  it('splits pages on #$e# and #$b# and keeps the exact separators', () => {
    const ast = parseDialogueScript(VANILLA_FIXTURES.Introduction ?? '')
    expect(ast.pages).toHaveLength(2)
    expect(ast.pages[0]?.separatorBefore).toBeNull()
    expect(ast.pages[1]?.separatorBefore).toBe('#$e#')

    const birthday = parseDialogueScript(VANILLA_FIXTURES.AcceptBirthdayGift_Negative ?? '')
    expect(birthday.pages).toHaveLength(2)
    expect(birthday.pages[1]?.separatorBefore).toBe('#$b#')
  })

  it('extracts trailing portrait commands, including numeric frames and leading spaces', () => {
    const intro = parseDialogueScript(VANILLA_FIXTURES.Introduction ?? '')
    expect(intro.pages[0]?.portrait).toEqual({ kind: 'none' })
    expect(intro.pages[1]?.portrait).toEqual({ kind: 'index', index: 9 })
    expect(intro.pages[1]?.portraitRaw).toBe('$9')

    const birthday = parseDialogueScript(VANILLA_FIXTURES.AcceptBirthdayGift_Negative ?? '')
    expect(birthday.pages[0]?.portrait).toEqual({ kind: 'emotion', emotion: 'h' })
    expect(birthday.pages[0]?.text).toBe('Hey, you remembered my birthday... Thanks, @!')

    const friday = parseDialogueScript(VANILLA_FIXTURES.Fri ?? '')
    expect(friday.pages[0]?.text).toBe("Wow, I just realized it's Friday.")
    expect(friday.pages[0]?.portraitRaw).toBe(' $u')
  })

  it('keeps inline protocol tokens (gender switch, %tokens, ^) inside the page text', () => {
    const gender = parseDialogueScript(VANILLA_FIXTURES.summer_Tue4 ?? '')
    expect(gender.pages[0]?.kind).toBe('text')
    expect(gender.pages[0]?.text).toContain('${guy^lady}$')

    const grave = parseDialogueScript(VANILLA_FIXTURES.Event_Grave3 ?? '')
    expect(grave.pages).toHaveLength(3)
    expect(grave.pages[0]?.text).toContain('$u^Why?')
    expect(grave.pages[0]?.portrait).toEqual({ kind: 'emotion', emotion: 'a' })
  })

  it('parses question pages into ids, fallback key, prompt, and responses', () => {
    const ast = parseDialogueScript(VANILLA_FIXTURES.Sun2 ?? '')
    const page = ast.pages[0]
    expect(page?.kind).toBe('question')
    expect(page?.text).toBe('I wonder what would happen if I spent all night in the graveyard?')
    expect(page?.question?.ids).toBe('17/18')
    expect(page?.question?.fallbackKey).toBe('Sun_old')
    expect(page?.question?.prompt).toBe('@, what do you think happens to us after we die?')
    expect(page?.question?.responses).toHaveLength(5)
    expect(page?.question?.responses[1]).toMatchObject({
      responseId: '18',
      score: '40',
      resultKey: 'Sun_18',
      text: 'We come back as spooky ghosts.',
    })
  })

  it('exposes advanced constructs as typed command segments without touching the raw', () => {
    for (const key of ['AcceptGift_(O)66', 'Sun_old', 'fall_Tue', 'Thu', 'Mon8', 'fall_Thu', 'houseUpgrade_1', 'Thu8'] as const) {
      const script = VANILLA_FIXTURES[key] ?? ''
      const firstPage = parseDialogueScript(script).pages[0]
      expect(firstPage?.kind, key).toBe('command')
      expect(firstPage?.segments.map((segment) => segment.raw).join('#'), key).toBe(firstPage?.raw)
      expect(serializeDialogueScript(parseDialogueScript(script)), key).toBe(script)
    }
  })

  it('parses each command segment into the arguments its spec declares', () => {
    const commandOf = (script: string, segmentIndex: number) => {
      const segment = parseDialogueScript(script).pages[0]?.segments[segmentIndex]
      return segment?.kind === 'command' ? segment : null
    }

    expect(commandOf(VANILLA_FIXTURES['AcceptGift_(O)66'] ?? '', 0)).toMatchObject({ command: 'c', args: ['0.5'] })
    expect(commandOf(VANILLA_FIXTURES.Sun_old ?? '', 0)).toMatchObject({ command: 'p', args: ['17'] })
    expect(commandOf(VANILLA_FIXTURES.fall_Tue ?? '', 0)).toMatchObject({ command: 'd', args: ['joja'] })
    expect(commandOf(VANILLA_FIXTURES.Thu ?? '', 1)).toMatchObject({ command: '1', args: ['Abigail1'] })
    expect(commandOf(VANILLA_FIXTURES.Mon8 ?? '', 0)).toMatchObject({
      command: 'query',
      args: ['PLAYER_NPC_RELATIONSHIP current any married roommate'],
    })
    expect(commandOf(VANILLA_FIXTURES.houseUpgrade_1 ?? '', 0)?.command).toBe('y')
    expect(parseDialogueScript('$t 600 1200#Morning only.').pages[0]?.segments[0]).toMatchObject({
      command: 't',
      args: ['600', '1200'],
    })
    expect(parseDialogueScript('$k 15#One-off line.').pages[0]?.segments[0]).toMatchObject({ command: 'k', args: ['15'] })
    expect(parseDialogueScript('$action AddMail Current Abigail1#Sent.').pages[0]?.segments[0]).toMatchObject({
      command: 'action',
      args: ['AddMail Current Abigail1'],
    })
  })

  it('does not mistake a portrait index for the $1 command', () => {
    const page = parseDialogueScript('Nice to see you.$12').pages[0]
    expect(page?.kind).toBe('text')
    expect(page?.portrait).toEqual({ kind: 'index', index: 12 })
  })

  it('keeps unparseable question blocks as raw pages', () => {
    const page = parseDialogueScript('$d joja#$q 17 fallback#Dangling prompt with no response.').pages[0]
    expect(page?.kind).toBe('raw')
    expect(page?.segments).toEqual([])
  })

  it('edits command arguments and speech segments inside a command page', () => {
    const script = VANILLA_FIXTURES['AcceptGift_(O)66'] ?? ''
    const ast = parseDialogueScript(script)

    const retuned = updateCommandSegment(ast, 'page:0', 'segment:0', ['0.75'])
    expect(retuned.startsWith('$c 0.75#')).toBe(true)
    expect(serializeDialogueScript(parseDialogueScript(retuned))).toBe(retuned)

    const retexted = setSegmentText(parseDialogueScript(retuned), 'page:0', 'segment:1', 'Rewritten line.')
    expect(retexted).toBe("$c 0.75#Rewritten line.$h#Thank you! This is my favorite stone. It's so pretty.")

    const reposed = setSegmentPortrait(parseDialogueScript(retexted), 'page:0', 'segment:1', { kind: 'emotion', emotion: 'a' })
    expect(reposed).toBe("$c 0.75#Rewritten line.$a#Thank you! This is my favorite stone. It's so pretty.")
  })

  it('re-parses edited scripts into the same structure (parse/serialize stability)', () => {
    const ast = parseDialogueScript(VANILLA_FIXTURES.Sun2 ?? '')
    const identical = updateQuestionFields(ast, 'page:0', { ids: '17/18', fallbackKey: 'Sun_old' })
    expect(identical).toBe(VANILLA_FIXTURES.Sun2)

    const edited = updateQuestionResponse(parseDialogueScript(identical), 'page:0', 'response:0', { score: '15' })
    const reparsed = parseDialogueScript(edited)
    expect(reparsed.pages[0]?.question?.responses[0]).toMatchObject({ responseId: '17', score: '15', resultKey: 'Sun_17' })
    expect(serializeDialogueScript(reparsed)).toBe(edited)
  })

  it('edits page text without disturbing sibling pages', () => {
    const ast = parseDialogueScript(VANILLA_FIXTURES.Introduction ?? '')
    const edited = setPageText(ast, 'page:0', 'Hello there.')
    expect(edited).toBe("Hello there.#$e#It's kind of a shame, really. I always enjoyed exploring those overgrown fields by myself.$9")
  })

  it('replaces the portrait suffix with a canonical token', () => {
    const ast = parseDialogueScript(VANILLA_FIXTURES.Fri ?? '')
    const edited = setPagePortrait(ast, 'page:0', { kind: 'emotion', emotion: 'a' })
    expect(edited).toBe("Wow, I just realized it's Friday.$a#$e#Sometimes I totally lose track of time.")

    const cleared = setPagePortrait(parseDialogueScript(edited), 'page:0', { kind: 'none' })
    expect(cleared).toBe("Wow, I just realized it's Friday.#$e#Sometimes I totally lose track of time.")
  })

  it('attaches a question skeleton that parses back as a question page', () => {
    const edited = attachQuestion(parseDialogueScript('What should we do?'), 'page:0')
    expect(edited).toBe('What should we do?#$q -1 -1##$r -1 0 -1#')
    const page = parseDialogueScript(edited).pages[0]
    expect(page?.kind).toBe('question')
    expect(page?.question?.responses).toHaveLength(1)
  })

  it('inserts and removes pages while renumbering ids', () => {
    const base = parseDialogueScript('First#$e#Second')
    expect(insertPageAfter(base, 'page:0', '#$b#')).toBe('First#$b##$e#Second')
    expect(insertPageAfter(base, null, '#$e#')).toBe('#$e#First#$e#Second')

    const removedFirst = removePage(base, 'page:0')
    expect(removedFirst).toBe('Second')
    const removedSecond = removePage(base, 'page:1')
    expect(removedSecond).toBe('First')
    expect(removePage(parseDialogueScript('Only'), 'page:0')).toBe('')
  })

  it('toggles the separator kind that introduces a page', () => {
    const base = parseDialogueScript('First#$e#Second')
    expect(setPageSeparator(base, 'page:1', '#$b#')).toBe('First#$b#Second')
  })
})
