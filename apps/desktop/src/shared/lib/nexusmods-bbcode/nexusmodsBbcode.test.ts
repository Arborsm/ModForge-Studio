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

  it('parses NexusMods HTML line breaks as line break nodes', () => {
    const document = parseNexusModsBbcode('Alpha<br />[size=3]Beta[/size]<br>Gamma')

    expect(document.children).toMatchObject([
      { type: 'text', value: 'Alpha' },
      { type: 'element', tag: 'br' },
      { type: 'element', tag: 'size', children: [{ type: 'text', value: 'Beta' }] },
      { type: 'element', tag: 'br' },
      { type: 'text', value: 'Gamma' },
    ])
  })

  it('maps safe HTML tags into the same sanitized AST used for BBCode rendering', () => {
    const document = parseNexusModsBbcode(
      '<strong>Bold</strong> <a href="https://example.com/path">Link</a> <img src="https://example.com/image.png" />',
    )

    expect(document.children).toMatchObject([
      { type: 'element', tag: 'b', children: [{ type: 'text', value: 'Bold' }] },
      { type: 'text', value: ' ' },
      { type: 'element', tag: 'url', attrs: { href: 'https://example.com/path' }, children: [{ type: 'text', value: 'Link' }] },
      { type: 'text', value: ' ' },
      { type: 'element', tag: 'img', attrs: { src: 'https://example.com/image.png' } },
    ])
  })

  it('parses NexusMods image tags with comma separated dimension attributes', () => {
    const document = parseNexusModsBbcode('[img width=425,height=250]https://example.com/image.png[/img]')

    expect(document.children).toMatchObject([
      {
        type: 'element',
        tag: 'img',
        attrs: { width: '425', height: '250' },
        children: [{ type: 'text', value: 'https://example.com/image.png' }],
      },
    ])
  })

  it('strips unsupported HTML tags instead of rendering them as visible text', () => {
    const document = parseNexusModsBbcode('<div>Visible</div><script>alert(1)</script>')

    expect(document.children).toEqual([{ type: 'text', value: 'Visiblealert(1)' }])
  })

  it('keeps crossed spoiler and center tags from leaking raw closing tokens', () => {
    const document = parseNexusModsBbcode('[center]Grandpa[spoiler]Map[center][spoiler]Image[/spoiler][/center][/spoiler]')
    const serialized = JSON.stringify(document)

    expect(serialized).toContain('"tag":"spoiler"')
    expect(serialized).not.toContain('[/spoiler]')
    expect(serialized).not.toContain('[/center]')
  })
})
