import { describe, expect, it } from 'vite-plus/test'
import { applyStardewI18nTranslations, parseStardewI18n } from '@shared/infra/game-formats/stardew-i18n/stardewI18n'

describe('Stardew i18n translation codec', () => {
  it('round-trips protocol-heavy mail without sending protocol fields as text', () => {
    const source = '@!^A gift for {{player}}. %item id (O)224 1 %%Enjoy it.$h[#]Gift title'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['A gift for', 'Enjoy it.', 'Gift title'])
    expect(applyStardewI18nTranslations(template, new Map())).toBe(source)
    const translated = new Map(template.textNodes.map((node) => [node.id, `译${node.value}`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe(
      '@!^译A gift for {{player}}. %item id (O)224 1 %%译Enjoy it.$h[#]译Gift title',
    )
  })

  it('keeps gender, question, choice, page, and positional markers in order', () => {
    const source = '${Sir^Madam}$#$b#$q -1 -1#Choose.$h#$r -1 -1 Yes#Yes#$r -1 -1 No#No $1'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['Sir', 'Madam', 'Choose.', 'Yes', 'No'])
    const translated = new Map(template.textNodes.map((node) => [node.id, `[${node.value}]`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe(
      '${[Sir]^[Madam]}$#$b#$q -1 -1#[Choose.]$h#$r -1 -1 Yes#[Yes]#$r -1 -1 No#[No] $1',
    )
  })

  it('does not treat ordinary slashes as data fields without an asset schema', () => {
    const source = 'Walk north/south, then answer yes/no.'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual([source])
    expect(applyStardewI18nTranslations(template, new Map([['part:0', '向北/南走，然后回答是/否。']]))).toBe('向北/南走，然后回答是/否。')
  })

  it('preserves player and named command tokens without mistaking percentages for commands', () => {
    const source = 'Dear @, this is 100% organic. %secretsanta ^See you.'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['Dear', ', this is 100% organic.', 'See you.'])
    const translated = new Map(template.textNodes.map((node) => [node.id, `[${node.value}]`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe('[Dear] @[, this is 100% organic.] %secretsanta  ^[See you.]')
  })

  it('keeps unknown percent text translatable while protecting complete mail commands', () => {
    const source = 'Keep %unknown text. %action AddMail flag %%After.%revealtaste:Maru:336 trailing %item incomplete remains.'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['Keep %unknown text.', 'After.', 'trailing %item incomplete remains.'])
    const translated = new Map(template.textNodes.map((node) => [node.id, `[译${node.value}]`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe(
      '[译Keep %unknown text.] %action AddMail flag %%[译After.]%revealtaste:Maru:336 [译trailing %item incomplete remains.]',
    )
  })

  it('does not treat unknown dollar-prefixed text as a dialogue command', () => {
    const template = parseStardewI18n('$question remains visible and $hello stays intact')
    expect(template.textNodes.map((node) => node.value)).toEqual(['$question remains visible and $hello stays intact'])
  })

  it('preserves custom formatting and all gender separators', () => {
    const source = '[letterbg 2][textcolor blue]${Sir¦Madam¦Friend}$'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['Sir', 'Madam', 'Friend'])
    const translated = new Map(template.textNodes.map((node) => [node.id, `译${node.value}`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe('[letterbg 2][textcolor blue]${译Sir¦译Madam¦译Friend}$')
  })

  it('extracts quick-response text without translating dialogue command fields', () => {
    const source = "$y 'Question_Yes_Great!*Again_No_Okay'#$p answered#Visible|Fallback"
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual([
      'Question',
      'Yes',
      'Great!',
      'Again',
      'No',
      'Okay',
      'Visible',
      'Fallback',
    ])
    expect(applyStardewI18nTranslations(template, new Map())).toBe(source)
  })

  it('keeps image notes opaque and protects composite placeholders', () => {
    expect(parseStardewI18n('!image 10').textNodes).toEqual([])
    const template = parseStardewI18n('Charged {0:N0}, owner {{name}}, value %1$s and slot $1.')
    expect(template.textNodes.map((node) => node.value)).toEqual(['Charged', ', owner', ', value', 'and slot'])
    expect(applyStardewI18nTranslations(template, new Map())).toBe('Charged {0:N0}, owner {{name}}, value %1$s and slot $1.')
  })

  it('preserves bare page markers and real line breaks', () => {
    const source = 'First page.$b#Second page.\nThird line.$neutral Unknown $hello'
    const template = parseStardewI18n(source)
    expect(template.textNodes.map((node) => node.value)).toEqual(['First page.', 'Second page.', 'Third line.', 'Unknown $hello'])
    const translated = new Map(template.textNodes.map((node) => [node.id, `译${node.value}`]))
    expect(applyStardewI18nTranslations(template, translated)).toBe(
      '译First page.$b#译Second page.\n译Third line.$neutral 译Unknown $hello',
    )
  })
})
