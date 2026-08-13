import { describe, expect, it } from 'vite-plus/test'
import {
  buildDialogueKey,
  parseDialogueKey,
  parseDialogueScript,
  serializeDialogueScript,
  setPageText,
  setPagePortrait,
  removeQuestion,
} from '@entities/dialogue'
import {
  buildAddMailAction,
  parseAddMailAction,
  tokenizeActionString,
  triggerDraftFromEntry,
  triggerDraftToEntry,
  parseMailString,
  serializeMailString,
  mailDraftFromString,
  mailDraftToString,
  serializeMailAttachment,
  parseMailAttachmentBody,
} from '@pages/workbench/workspaces/mail/entities/mail'

describe('adversarial scratch', () => {
  it('dialogue key canonicalization identity', () => {
    for (const key of ['Mon0', 'Tue04', 'fall_05', '15', 'Resort_Bar_1', '09']) {
      const rebuilt = buildDialogueKey(parseDialogueKey(key))
      console.log(`KEY ${key} -> ${rebuilt}`)
    }
    expect(true).toBe(true)
  })

  it('dialogue separators at edges', () => {
    for (const s of ['#$e#Hello', 'A#$e#', 'A#$e##$b#B', '#$e#', '']) {
      const ast = parseDialogueScript(s)
      const roundTrip = serializeDialogueScript(ast)
      console.log(
        `SEP ${JSON.stringify(s)} pages=${ast.pages.length} kinds=${ast.pages.map((p) => p.kind).join(',')} rt=${roundTrip === s}`,
      )
    }
    expect(true).toBe(true)
  })

  it('gender switch trailing token vs portrait split', () => {
    const raw = 'You are ${guy^lady}$'
    const ast = parseDialogueScript(raw)
    console.log('GS', JSON.stringify(ast.pages[0]))
    // Edit an unrelated page property and see if the script survives
    const rebuilt = setPagePortrait(ast, 'page:0', ast.pages[0]!.portrait)
    console.log('GS rebuilt', JSON.stringify(rebuilt))
  })

  it('question page removeQuestion without leading text', () => {
    const raw = '$q 1 2#Prompt?#$r 1 0 k#Yes'
    const ast = parseDialogueScript(raw)
    console.log('Q kinds', ast.pages[0]?.kind, 'hasLeading', ast.pages[0]?.hasLeadingTextSegment)
    console.log('Q removeQuestion ->', JSON.stringify(removeQuestion(ast, 'page:0')))
  })

  it('setPageText canonicalization of sibling raw/question pages', () => {
    const raw = 'Hi$h#$e#$c 0.5#A#B#$e#Q#$q 5 fb#Prompt#$r 1 0 k#Yes$s'
    const ast = parseDialogueScript(raw)
    console.log('SIB kinds', ast.pages.map((p) => p.kind).join(','))
    const edited = setPageText(ast, 'page:0', 'Yo')
    console.log('SIB edited', JSON.stringify(edited))
  })

  it('mail trigger quoting round trip', () => {
    const action = 'AddMail Current "Mail With Spaces" tomorrow'
    console.log('TOKENS', JSON.stringify(tokenizeActionString(action)))
    const parsed = parseAddMailAction(action)
    console.log('PARSED', JSON.stringify(parsed))
    if (parsed) {
      const rebuilt = buildAddMailAction(parsed)
      console.log('REBUILT', JSON.stringify(rebuilt))
      console.log('REPARSE', JSON.stringify(parseAddMailAction(rebuilt)))
    }
    const entry = { Id: 'T1', Trigger: 'DayStarted', Action: action }
    const draft = triggerDraftFromEntry('T1', entry)
    console.log('DRAFT', JSON.stringify(draft))
    if (draft) {
      console.log('TO_ENTRY', JSON.stringify(triggerDraftToEntry(draft)))
    }
  })

  it('hostile mail strings', () => {
    const cases = [
      'Get 100%% profit^Enjoy[#]Odd',
      'Body[#]Title with %item id (O)388 %%',
      '%item id (O)388 [#] x %%tail[#]RealTitle',
      'Tail text[letterbg 2]',
      '[letterbg a b c d]Body',
      'A¦B¦C[#]T',
      '%item money 500 400 %%Body[#]T',
      '%item id  %%',
    ]
    for (const value of cases) {
      const parsed = parseMailString(value)
      const rt = serializeMailString(parsed)
      const draft = mailDraftFromString(value)
      const draftRt = mailDraftToString(draft)
      console.log(`MAIL ${JSON.stringify(value)}`)
      console.log(
        `  segs=${JSON.stringify(parsed.segments.map((s) => ({ k: s.kind, r: s.raw })))} title=${JSON.stringify(parsed.title)} rt=${rt === value}`,
      )
      console.log(
        `  draft body=${JSON.stringify(draft.body)} bgRaw=${JSON.stringify(draft.backgroundRaw)} draftRt=${JSON.stringify(draftRt)}`,
      )
    }
    expect(true).toBe(true)
  })

  it('attachment serialize edge', () => {
    console.log('UNK', JSON.stringify(serializeMailAttachment({ kind: 'unknown', body: '' })))
    console.log('CT', JSON.stringify(serializeMailAttachment({ kind: 'conversationTopic', topicId: 'X', days: null })))
    console.log('PAIRS', JSON.stringify(parseMailAttachmentBody('id 388 390')))
  })
})
