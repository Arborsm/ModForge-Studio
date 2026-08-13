import { describe, expect, it } from 'vite-plus/test'
import {
  mailDraftFromString,
  mailDraftToString,
  parseMailString,
  serializeMailString,
} from '@pages/workbench/workspaces/mail/entities/mail'

/** Exact strings from the unpacked vanilla `Data/mail.json` (1.6). */
const VANILLA_FIXTURES: Record<string, string> = {
  Robin:
    'Hey there!^I had some extra wood lying around... I thought maybe you could use it. Take care!  ^   -Robin %item id (O)388 50 %%[#]A Gift From Robin',
  Demetrius:
    'Dear @,^I was conducting a field study the other day, and I found this specimen. ^I hope you find it as interesting as I did.    ^   -Demetrius%item id (O)392 1 (O)394 1 (O)132 1 (O)66 1 %%[#]A Gift From Demetrius',
  Pierre:
    "Dear valued customer,^Thanks for visiting 'Pierre's'! Enclosed is your 'Cash-back Rewards Program' rebate. See you soon! ^   -Pierre^  P.S. Sorry for the stock message, @. Enjoy! %item money 250 601  %%[#]A Gift From Pierre",
  mom1: "Dear @,^  How are you doing, sweety? I've missed you so much since you left. I hope the farming life is everything you hoped for. ^   Love, Mom.   ^   P.S. I sent your favorite cookies < %item id (O)223 1 %%[#]From Mom",
  wizardJunimoNote:
    "My sources tell me you've been poking around inside the old community center.^Why don't you pay me a visit?^My chambers are west of the forest lake, in the stone tower. I may have information concerning your... 'rat problem'.^   -M. Rasmodius, Wizard %item quest 1 true %%[#]Wizard's Summons",
  skullCave:
    "I see you've entered the Skull Cavern. Well done.^I've got a better challenge for you, kid. Make it at least 25 levels deep. I've got a mountain of $ to send if you can do it.^  Your friend, Mr. Qi %item quest 20 %%[#]Qi's Challenge",
  elliottLetter1:
    "@, my love,^^I've just arrived in Grampleton, to start the tour. I've forgotten how hectic the city is! The streets are packed with people... they either seem in a mad hurry, or lost in a daze, unaware of their surroundings. I miss Pelican Town already!^^I begin the tour this evening, at a local bookstore. I must admit, I'm becoming a bit nervous at the thought of public speaking... my stomach feels as if it's been twisted into a soft pretzel and doused with spicy cheese dip. Wish me luck!^^-Love, Elliott^^P.S. I hope you had a peaceful night, and weren't too scared all alone in that big house! %item conversationTopic ElliottGone2 0 %%[#]Letter From My Husband",
  RarecrowSociety:
    'Dear @,^^Your dedication is truly impressive...^^Only a select few manage to acquire the complete Rarecrow collection!^^Please accept this blueprint to commemorate your achievement.^   -The Z.C. Rarecrow Society%item craftingRecipe Deluxe_Scarecrow %%[#]From The Rarecrow Society',
  winter_18:
    "Dear @,^I would like to give you some information about an upcoming event: the Feast of the Winter Star. It's a time for the community to come together and think back on all the good fortune we've had this year.^A favorite tradition is the \"secret gift exchange\", where everyone in town is randomly assigned to someone else. On the day of the festival, everyone brings a gift for their secret friend and surprises them with something special!^This year, your secret friend is:^    %secretsanta ^Don't tell anyone! The feast will take place on the 25th from 9AM to 2PM at the town square. See you then! ^   -Mayor Lewis[#]Secret Gift-Giver",
  RobinCooking:
    "Dear @,^here is an old recipe that my grandma passed down to me. Enjoy!   ^   -Robin%item cookingRecipe %%[#]Robin's Family Recipe",
  MarlonRecovery: '@,^Found your lost item.^^Be more careful next time!^   -Marlon%item itemRecovery %%[#]Marlon Found Your Item',
  Beat_PK:
    "Congratulations!!^^You beat 'Journey Of The Prairie King', and were randomly selected in our exclusive winner's sweepstakes! ^You've won a Prairie King Arcade System of your very own!^Now you can enjoy 'Journey Of The Prairie King' from the comfort of your own home.^^You deserve it!^-Prairie King Development Team %item id (BC)141 %%[#]P.K. Congratulations!",
  QiChallengeComplete: "You did it.^ I'm very impressed.^ Enjoy your reward.^   -Qi. %item money 10000 %%[#]Qi Challenge Complete",
  passedOut1_Billed_Male:
    "Dear Mr. @,^Last night, a Joja team member found you incapacitated. A medical team was dispatched to bring you home safely.^We're glad you're okay!^^(You've been billed {0}g for this service)^^-Morris^Joja Customer Satisfaction Representative[#]Joja Invoice",
}

/** Wiki-documented forms not present in the current vanilla file. */
const WIKI_FIXTURES: Record<string, string> = {
  legacyObject: 'Hey there!^Take care!  ^   -Robin %item object 388 50 390 10 %%[#]A Gift From Robin',
  legacyTools: 'Your tools are ready.^ -Clint %item tools Axe Scythe %%[#]New Tools',
  letterbgAndGender: '[letterbg 2][textcolor white]Greetings, young adept.^Use it wisely, Sir¦Use it wisely, Madam[#]Wizard Note',
  customLetterbg: '[letterbg Mods\\MyLetters 1]A custom-styled letter.^See you![#]Custom Note',
}

describe('mail string codec', () => {
  it('round-trips every vanilla fixture through the lossless segment model', () => {
    for (const [key, value] of Object.entries(VANILLA_FIXTURES)) {
      expect(serializeMailString(parseMailString(value)), key).toBe(value)
    }
  })

  it('round-trips wiki-documented forms through the lossless segment model', () => {
    for (const [key, value] of Object.entries(WIKI_FIXTURES)) {
      expect(serializeMailString(parseMailString(value)), key).toBe(value)
    }
  })

  it('round-trips every fixture through the editable draft model', () => {
    for (const [key, value] of Object.entries({ ...VANILLA_FIXTURES, ...WIKI_FIXTURES })) {
      expect(mailDraftToString(mailDraftFromString(value)), key).toBe(value)
    }
  })

  it('extracts collection titles and keeps bodies free of commands', () => {
    const draft = mailDraftFromString(VANILLA_FIXTURES['Robin']!)
    expect(draft.title).toBe('A Gift From Robin')
    expect(draft.body).not.toContain('%item')
    expect(draft.body).not.toContain('[#]')
    expect(draft.body.startsWith('Hey there!^I had some extra wood')).toBe(true)
  })

  it('parses multi-pair id attachments with counts', () => {
    const draft = mailDraftFromString(VANILLA_FIXTURES['Demetrius']!)
    expect(draft.attachments).toHaveLength(1)
    expect(draft.attachments[0]!.attachment).toEqual({
      kind: 'id',
      items: [
        { itemId: '(O)392', count: 1 },
        { itemId: '(O)394', count: 1 },
        { itemId: '(O)132', count: 1 },
        { itemId: '(O)66', count: 1 },
      ],
    })
  })

  it('parses money ranges, quests, topics, and recipe commands', () => {
    expect(mailDraftFromString(VANILLA_FIXTURES['Pierre']!).attachments[0]!.attachment).toEqual({ kind: 'money', min: 250, max: 601 })
    expect(mailDraftFromString(VANILLA_FIXTURES['QiChallengeComplete']!).attachments[0]!.attachment).toEqual({
      kind: 'money',
      min: 10000,
      max: null,
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['wizardJunimoNote']!).attachments[0]!.attachment).toEqual({
      kind: 'quest',
      questId: '1',
      autoAdd: true,
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['skullCave']!).attachments[0]!.attachment).toEqual({
      kind: 'quest',
      questId: '20',
      autoAdd: false,
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['elliottLetter1']!).attachments[0]!.attachment).toEqual({
      kind: 'conversationTopic',
      topicId: 'ElliottGone2',
      days: 0,
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['RobinCooking']!).attachments[0]!.attachment).toEqual({
      kind: 'cookingRecipe',
      recipeKey: null,
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['RarecrowSociety']!).attachments[0]!.attachment).toEqual({
      kind: 'craftingRecipe',
      recipeKey: 'Deluxe_Scarecrow',
    })
    expect(mailDraftFromString(VANILLA_FIXTURES['MarlonRecovery']!).attachments[0]!.attachment).toEqual({ kind: 'itemRecovery' })
  })

  it('keeps %secretsanta and printf-style placeholders inside the body text', () => {
    const santa = mailDraftFromString(VANILLA_FIXTURES['winter_18']!)
    expect(santa.attachments).toHaveLength(0)
    expect(santa.body).toContain('%secretsanta')
    expect(santa.title).toBe('Secret Gift-Giver')

    const billed = mailDraftFromString(VANILLA_FIXTURES['passedOut1_Billed_Male']!)
    expect(billed.body).toContain('{0}g')
    expect(billed.title).toBe('Joja Invoice')
  })

  it('parses prefix commands into background and text color fields', () => {
    const draft = mailDraftFromString(WIKI_FIXTURES['letterbgAndGender']!)
    expect(draft.background).toEqual({ kind: 'vanilla', index: 2 })
    expect(draft.textColor).toBe('white')
    expect(draft.body).toContain('¦')
    expect(draft.title).toBe('Wizard Note')

    const custom = mailDraftFromString(WIKI_FIXTURES['customLetterbg']!)
    expect(custom.background).toEqual({ kind: 'custom', assetName: 'Mods\\MyLetters', index: 1 })
  })

  it('parses deprecated object pairs and tools lists', () => {
    expect(mailDraftFromString(WIKI_FIXTURES['legacyObject']!).attachments[0]!.attachment).toEqual({
      kind: 'object',
      items: [
        { itemId: '388', count: 50 },
        { itemId: '390', count: 10 },
      ],
    })
    expect(mailDraftFromString(WIKI_FIXTURES['legacyTools']!).attachments[0]!.attachment).toEqual({
      kind: 'tools',
      tools: ['Axe', 'Scythe'],
    })
  })

  it('preserves unknown %item forms and %action blocks verbatim', () => {
    const value = 'Hello!^Enjoy. %item mysteryForm abc 1 %%%action AddMoney 500 %%[#]Odd Letter'
    expect(serializeMailString(parseMailString(value))).toBe(value)
    const draft = mailDraftFromString(value)
    expect(draft.attachments[0]!.attachment).toEqual({ kind: 'unknown', body: 'mysteryForm abc 1' })
    expect(draft.actions).toEqual(['%action AddMoney 500 %%'])
    expect(mailDraftToString(draft)).toBe(value)
  })

  it('canonicalizes inter-command whitespace into the body on draft serialization only', () => {
    const value = 'Hello!^Enjoy. %item mysteryForm abc 1 %% %action AddMoney 500 %%[#]Odd Letter'
    // The lossless segment model keeps the source exact; the draft model moves the whitespace
    // between commands into the body, so commands become adjacent after an edit round-trip.
    expect(serializeMailString(parseMailString(value))).toBe(value)
    expect(mailDraftToString(mailDraftFromString(value))).toBe(
      'Hello!^Enjoy.  %item mysteryForm abc 1 %%%action AddMoney 500 %%[#]Odd Letter',
    )
  })

  it('serializes edited drafts in canonical vanilla order', () => {
    const draft = mailDraftFromString('')
    const next = {
      ...draft,
      background: { kind: 'vanilla', index: 3 } as const,
      textColor: 'white',
      body: 'Hello @!^Welcome to the valley.',
      attachments: [{ raw: null, attachment: { kind: 'money', min: 500, max: null } as const }],
      title: 'Welcome Letter',
    }
    expect(mailDraftToString(next)).toBe('[letterbg 3][textcolor white]Hello @!^Welcome to the valley.%item money 500 %%[#]Welcome Letter')
  })

  it('treats letters without a [#] suffix as having no collection title', () => {
    const value = 'Meet me at the docks. ^ -Elliott'
    const parsed = parseMailString(value)
    expect(parsed.title).toBeNull()
    expect(serializeMailString(parsed)).toBe(value)
  })
})
