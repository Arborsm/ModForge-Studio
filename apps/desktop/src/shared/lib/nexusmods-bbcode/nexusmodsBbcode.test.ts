import { describe, expect, it } from 'vitest'
import { parseNexusModsBbcode } from './nexusmodsBbcode'

describe('parseNexusModsBbcode', () => {
  it('parses nested formatting, aligned blocks, attributes, links, and Nexus list items', () => {
    const document = parseNexusModsBbcode(
      '[font=Georgia][center][b][color=#f6b26b][size=3]Basic Bedroom Furniture[/size][/color][/b] ' +
        '[i][color=#a2c4c9]by orangeblossom[/color][/i][/center] ' +
        '[size=2]Get it from [/size][url=https://www.nexusmods.com/stardewvalley/mods/23073]catalogue[/url] ' +
        'Translation Credits: [list] [*][font=Georgia][i]Keluoluooo[/i] for the Chinese translation[/font] [/list][/font]',
    )

    expect(document.children).toHaveLength(1)
    expect(document.children[0]).toMatchObject({
      type: 'element',
      tag: 'font',
      attrs: { font: 'Georgia' },
    })

    const font = document.children[0]
    expect(font.type).toBe('element')
    if (font.type !== 'element') {
      return
    }

    expect(font.children[0]).toMatchObject({
      type: 'element',
      tag: 'center',
    })
    expect(JSON.stringify(document)).toContain('"tag":"url"')
    expect(JSON.stringify(document)).toContain('https://www.nexusmods.com/stardewvalley/mods/23073')
    expect(JSON.stringify(document)).toContain('"tag":"list"')
    expect(JSON.stringify(document)).toContain('"tag":"item"')
  })

  it('keeps unknown tags as text and preserves unclosed tag content', () => {
    const document = parseNexusModsBbcode('[unknown=x]raw[/unknown] [b]bold')

    expect(document.children).toEqual([
      { type: 'text', value: '[unknown=x]raw[/unknown] ' },
      {
        type: 'element',
        tag: 'b',
        attrs: {},
        children: [{ type: 'text', value: 'bold' }],
      },
    ])
  })
})
