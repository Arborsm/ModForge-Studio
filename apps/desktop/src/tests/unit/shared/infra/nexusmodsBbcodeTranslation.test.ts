import { describe, expect, it } from 'vite-plus/test'
import { applyNexusModsBbcodeTextTranslations, extractNexusModsBbcodeTextSegments } from '@shared/infra/game-formats/nexusmods-bbcode'

describe('Nexus Mods BBCode translation segments', () => {
  it('translates visible text without changing tags, links, media, or attributes', () => {
    const source = '[b]Hello[/b] [url=https://example.com/path]Open link[/url] [img]https://example.com/image.png[/img] Tail'
    const segments = extractNexusModsBbcodeTextSegments(source)
    expect(segments.map((segment) => segment.text)).toEqual(['Hello', 'Open link', ' Tail'])
    const translations = new Map(segments.map((segment) => [segment.id, `<${segment.text}>`]))
    const result = applyNexusModsBbcodeTextTranslations(source, segments, translations)
    expect(result).toContain('[url=https://example.com/path]')
    expect(result).toContain('[img]https://example.com/image.png[/img]')
    expect(result).toBe('[b]<Hello>[/b] [url=https://example.com/path]<Open link>[/url] [img]https://example.com/image.png[/img]< Tail>')
  })

  it('does not let an HTML image suppress following visible text', () => {
    const source = '<img src="https://example.com/image.png">Visible after image'
    expect(extractNexusModsBbcodeTextSegments(source).map((segment) => segment.text)).toEqual(['Visible after image'])
  })
})
