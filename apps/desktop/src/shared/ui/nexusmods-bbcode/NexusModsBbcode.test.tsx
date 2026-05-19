import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NexusModsBbcode } from './NexusModsBbcode'

describe('NexusModsBbcode', () => {
  it('does not reuse generated line break keys across adjacent text nodes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<NexusModsBbcode source={'Alpha\nBravo[b]Bold[/b]Charlie\nDelta'} />)

    expect(
      consoleError.mock.calls.some((call) => call.some((part) => String(part).includes('Encountered two children with the same key'))),
    ).toBe(false)
    consoleError.mockRestore()
  })

  it('removes unreachable remote images from rendered BBCode after load failure', () => {
    const { container } = render(<NexusModsBbcode source="[img]https://i.imgur.com/L2T4Wii.gif[/img]" />)

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('referrerPolicy', 'no-referrer')

    fireEvent.error(image as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the real NexusMods 20289 description sections as separate blocks', () => {
    const source =
      "[size=3][i][font=Tahoma][color=#ffe599][b]Ever wanted to know what's inside the Bus? Now you can enter and explore it![/b]\n" +
      '<br />[/color][/font][color=#ffe599]-------------------------------------------[/color][/i]\n' +
      '<br />[/size][font=Tahoma][center][size=3]This mod adds custom Bus interior map that player can enter and interact with. \n' +
      "<br />This is just a simple small extra map mod that doesn't add any new game changing stuff.\u00A0\n" +
      '<br />[/size][/center][size=3][list]\n' +
      '<br />[color=#ffe599]\n' +
      '<br />[/color][/list][/size][/font][b]Features:[/b][font=Tahoma][size=3]\n' +
      '<br />[list]\n' +
      "<br />[*]\u00A0A couple of new events\u00A0(just to bring a bit more life into the game) (for now it's just one event but I'll add more soon)\n" +
      '<br />[*]New lootable\u00A0trash can with unique (sometimes rare) drops\n' +
      '<br />[*]Seasonal and conditional bus interior decor\n' +
      '<br />[/list][/size][/font][font=Tahoma][size=3][color=#93c47d][b]Compatibility[/b]:[/color]\n' +
      '<br />[/size][list]\n' +
      '<br />[*][font=Tahoma][size=3]with any recolor[/size][/font]\n' +
      '<br />[*][font=Tahoma][size=3]with Stardew Valley Expanded, Ridgeside Valley and most other expansion mods[/size][/font]\n' +
      '<br />[*][font=Tahoma][size=3]with most mods that change the look of BusStop map[/size][/font]\n' +
      '<br />[/list][size=3]\n' +
      '<br />[color=#ffe599][b]Installation:[/b][/color]\n' +
      '<br />[list]\n' +
      '<br />[*][size=3]Install SMAPI, Content Patcher, Farm Type Manager[/size]\n' +
      '<br />[*][size=3](Optional) Install Generic Mod Config Menu\uFEFF[/size]\n' +
      '<br />[*]Unzip "Aimon\'s Bus Interior" archive into Stardew&#92;Mods folder.\n' +
      '<br />[*][size=3]Run the game using SMAPI.[/size]\n' +
      '<br />[*][size=3]Enjoy![/size]\n' +
      '<br />[/list][/size][/font][font=Tahoma][size=3][color=#ffe599][b]Config:[/b][/color]\n' +
      '<br />[/size][/font][list]\n' +
      '<br />[*][font=Tahoma][size=3]Cleaner bus - true&#92;false (if true - removes most of the trash decor from bus map from the start. Else the bus will become cleaner automatically after finishing the CommunityCentre vault bundle.)[/size][/font]\n' +
      '<br />[*][font=Tahoma][size=3]Lootable Trash Bin\u00A0- true&#92;false (Adds lootable trash bin in bus.)[/size][/font]\n' +
      '<br />[/list][font=Tahoma][size=3]\n' +
      '<br />[center][b][color=#ffe599]Mods used on screenshots:[/color][/b]\n' +
      '<br />----------------------------\n' +
      '<br />Stardew Foliage Redone\n' +
      '<br />Stardew Valley Expanded\n' +
      '<br />----------------------------[/center]\n' +
      '<br />[/size][/font][center][/center][size=3][font=Tahoma][color=#ffe599]\n' +
      '<br />[/color][/font][/size]'

    const { container } = render(<NexusModsBbcode source={source} />)

    const features = screen.getByText('Features:')
    const compatibility = screen.getByText('Compatibility')
    const installation = screen.getByText('Installation:')
    const config = screen.getByText('Config:')

    expect(features.closest('li')).toBeNull()
    expect(compatibility.closest('li')).toBeNull()
    expect(installation.closest('li')).toBeNull()
    expect(config.closest('li')).toBeNull()
    expect(features.closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(compatibility.closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(installation.closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(config.closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(container.querySelectorAll('ul .nexusmods-bbcode-block')).toHaveLength(0)
    expect(container.querySelectorAll('li ul')).toHaveLength(0)
    expect(container.querySelectorAll('.nexusmods-bbcode-list-bulleted')).toHaveLength(4)
    expect(screen.getByText("Ever wanted to know what's inside the Bus? Now you can enter and explore it!").nextSibling?.nodeName).toBe(
      'BR',
    )
    const intro = container.querySelector('.nexusmods-bbcode-align-center')
    expect(intro?.querySelectorAll('.nexusmods-bbcode-line')).toHaveLength(2)
    const screenshotMods = screen.getByText('Mods used on screenshots:').closest('.nexusmods-bbcode-align-center')
    expect(screenshotMods?.querySelectorAll('.nexusmods-bbcode-line')).toHaveLength(5)
    expect(screen.getByText('-------------------------------------------').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getAllByText('----------------------------')).toHaveLength(2)
    expect(screen.getAllByText('----------------------------').every((line) => line.closest('.nexusmods-bbcode-line'))).toBe(true)
    expect(screen.getByText('Mods used on screenshots:').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getByText('Stardew Foliage Redone').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getByText('Stardew Valley Expanded').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toContain('Stardew\\Mods')
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toContain('&#92;')
  })

  it('preserves NexusMods generated HTML description blocks and lists', () => {
    const { container } = render(
      <NexusModsBbcode source='<font size="3"><em><font style="font-family: Tahoma;"><font style="color: #ffe599;"><strong>Ever wanted to know what&apos;s inside the Bus? Now you can enter and explore it!</strong><br></font></font><font style="color: #ffe599;">-------------------------------------------</font></em><br></font><font style="font-family: Tahoma;"><div align="center"><font size="3">This mod adds custom Bus interior map that player can enter and interact with. <br>This is just a simple small extra map mod that doesn&apos;t add any new game changing stuff.&nbsp;<br></font></div></font><strong>Features:</strong><font style="font-family: Tahoma;"><font size="3"><br><ul class="disc"><li>&nbsp;A couple of new events</li><li>New lootable&nbsp;trash can with unique drops</li><li>Seasonal and conditional bus interior decor<br></li></ul></font></font><font style="font-family: Tahoma;"><font size="3"><font style="color: #93c47d;"><strong>Compatibility</strong>:</font><br></font><ul class="disc"><li><font style="font-family: Tahoma;"><font size="3">with any recolor</font></font></li></ul><font size="3"><br><font style="color: #ffe599;"><strong>Installation:</strong></font><br><ul class="disc"><li><font size="3">Install SMAPI, Content Patcher, Farm Type Manager</font></li></ul></font></font>' />,
    )

    expect(screen.getByText(/This mod adds custom Bus interior map/).closest('.nexusmods-bbcode-align-center')).toBeTruthy()
    expect(screen.getByText('Features:').closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(screen.getByText('Compatibility').closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(screen.getByText('Installation:').closest('.nexusmods-bbcode-block')).toBeTruthy()
    expect(container.querySelectorAll('li ul')).toHaveLength(0)
    expect(container.querySelectorAll('.nexusmods-bbcode-list-bulleted')).toHaveLength(3)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toContain("what's inside")
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toContain('&nbsp;')
    expect(container.innerHTML).not.toContain('&lt;ul')
    expect(container.innerHTML).not.toContain('&lt;font')
  })

  it('keeps plain copied Nexus line breaks as block lines when HTML breaks were stripped upstream', () => {
    render(
      <NexusModsBbcode
        source={
          '[center][b][color=#ffe599]Mods used on screenshots:[/color][/b]\n' +
          '----------------------------\n' +
          'Stardew Foliage Redone\n' +
          'Stardew Valley Expanded\n' +
          '----------------------------[/center]'
        }
      />,
    )

    expect(screen.getByText('Mods used on screenshots:').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getByText('Stardew Foliage Redone').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getByText('Stardew Valley Expanded').closest('.nexusmods-bbcode-line')).toBeTruthy()
    expect(screen.getAllByText('----------------------------')).toHaveLength(2)
  })

  it('renders NexusMods BBCode as React elements without injecting raw HTML', () => {
    const { container } = render(
      <NexusModsBbcode source="[center][b][color=#f6b26b][size=3]Basic Bedroom Furniture[/size][/color][/b][/center] [url=https://www.nexusmods.com/stardewvalley/mods/23073]catalogue[/url][list][*]green = [color=#93c47d]NEW[/color][/list]" />,
    )

    expect(screen.getByText('Basic Bedroom Furniture')).toHaveStyle({ color: '#f6b26b' })
    expect(screen.getByRole('link', { name: 'catalogue' })).toHaveAttribute('href', 'https://www.nexusmods.com/stardewvalley/mods/23073')
    expect(container.querySelector('.nexusmods-bbcode-align-center')).toBeTruthy()
    expect(container.querySelector('ul')).toBeTruthy()
    expect(container.innerHTML).not.toContain('[color=#f6b26b]')
  })

  it('does not render unsafe links or unsafe color values as active attributes', () => {
    const { container } = render(<NexusModsBbcode source="[url=javascript:alert(1)]bad[/url] [color=expression(alert(1))]red[/color]" />)

    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByText('bad')).toBeTruthy()
    expect(screen.getByText('red')).not.toHaveAttribute('style')
    expect(container.innerHTML).not.toContain('javascript:')
  })

  it('renders ordinary Nexus list items with bullets like NexusMods descriptions', () => {
    const { container } = render(<NexusModsBbcode source="[list][*]green = [color=#93c47d]NEW[/color] [*]red = rotate[/list]" />)

    expect(container.querySelector('.nexusmods-bbcode-list')).toHaveClass('nexusmods-bbcode-list-bulleted')
    expect(screen.getByText(/green =/).closest('li')).toHaveClass('nexusmods-bbcode-list-item')
  })

  it('normalizes copied NexusMods hidden indent whitespace into readable text spacing', () => {
    const { container } = render(<NexusModsBbcode source={'[i][u]beds[/u][/i] ﻿1. double bed ﻿ ﻿- double bed ﻿ ﻿- blocky double bed'} />)

    const rendered = container.querySelector('.nexusmods-bbcode')?.textContent ?? ''
    expect(rendered).toContain('1. double bed')
    expect(rendered).toContain('- double bed')
    expect(rendered).not.toMatch(/\s{3,}/u)
    expect(container.querySelectorAll('br')).toHaveLength(0)
    expect(container.querySelector('.nexusmods-bbcode-indent')).toBeNull()
  })

  it('renders decorative furniture section labels as block headings instead of joining the previous line', () => {
    const { container } = render(<NexusModsBbcode source={'﻿- blocky single bed [i] [u]ꕥ end table[/u][/i] ﻿1. wooden end table'} />)

    const heading = screen.getByText('ꕥ end table')
    expect(heading.closest('.nexusmods-bbcode-section-heading')).toBeTruthy()
    expect(heading.closest('.nexusmods-bbcode-section-heading')?.nextSibling?.nodeName).not.toBe('BR')
    expect(container.querySelectorAll('br')).toHaveLength(0)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toContain('bed - ꕥ')
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toMatch(/\n?\s-\s*ꕥ/u)
  })

  it('does not add an empty line between furniture headings and their first copied NexusMods item', () => {
    const { container } = render(<NexusModsBbcode source={'[i][size=2][u]ꕥ beds[/u][/size][/i] ﻿1. double bed ﻿ ﻿- double bed'} />)

    const heading = screen.getByText('ꕥ beds')
    expect(heading.closest('.nexusmods-bbcode-section-heading')).toBeTruthy()
    expect(heading.closest('.nexusmods-bbcode-section-heading')?.nextSibling?.nodeName).not.toBe('BR')
    expect(container.querySelectorAll('br')).toHaveLength(0)
  })

  it('collapses copied NexusMods furniture item markers without adding synthetic indentation', () => {
    const { container } = render(
      <NexusModsBbcode source={'[i][size=2][u]ꕥ beds[/u][/size][/i] ﻿1. double bed ﻿ ﻿- double bed ﻿ ﻿- blocky double bed'} />,
    )

    const indents = Array.from(container.querySelectorAll('.nexusmods-bbcode-indent'))
    expect(indents).toHaveLength(0)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toContain('1. double bed - double bed - blocky double bed')
  })

  it('does not leave an isolated copied list marker before the next furniture heading', () => {
    const { container } = render(
      <NexusModsBbcode source={'﻿ ﻿- [color=#93c47d]blocky single bed[/color] [i] [u]ꕥ end table[/u][/i] ﻿1. wooden end table'} />,
    )

    const heading = screen.getByText('ꕥ end table').closest('.nexusmods-bbcode-section-heading')
    expect(heading).toBeTruthy()
    expect(heading?.previousSibling?.textContent).toBe('blocky single bed')
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toMatch(/-\s*ꕥ end table/u)
  })

  it('renders NexusMods mixed HTML line breaks without showing raw tokens', () => {
    const { container } = render(<NexusModsBbcode source="<br />[size=3][center]Install Guide[/center][/size]<br>Next line" />)

    expect(screen.getByText('Install Guide')).toBeTruthy()
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toContain('Next line')
    expect(container.innerHTML).not.toContain('&lt;br')
    expect(container.innerHTML).not.toContain('[size=3]')
  })

  it('caps repeated HTML line breaks to one blank line', () => {
    const { container } = render(<NexusModsBbcode source="Alpha<br><br><br><br>Beta" />)

    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toBe('AlphaBeta')
  })

  it('renders empty inline wrappers that only contain line breaks as a compact spacer', () => {
    const { container } = render(
      <NexusModsBbcode source="[center][url=https://example.com/faq]Click Here![/url][/center][size=3][url=https://example.com/faq]<br><br><br>[/url][/size][center][img]https://example.com/next.png[/img][/center]" />,
    )

    expect(screen.getByRole('link', { name: 'Click Here!' })).toHaveAttribute('href', 'https://example.com/faq')
    expect(container.querySelectorAll('br')).toHaveLength(0)
    expect(container.querySelectorAll('.nexusmods-bbcode-soft-spacer')).toHaveLength(1)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/next.png')
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })

  it('renders NexusMods image tags with dimension attributes instead of showing raw markup', () => {
    const { container } = render(
      <NexusModsBbcode source="[img width=425,height=250]https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385431-1482639146.png[/img]" />,
    )

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://staticdelivery.nexusmods.com/mods/1303/images/7608/7608-1610385431-1482639146.png',
    )
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toContain('[img width=')
  })

  it('renders safe mixed HTML tags through the same sanitized React renderer', () => {
    const { container } = render(
      <NexusModsBbcode source='<strong>Bold</strong> <a href="https://example.com/path">Link</a> <img src="https://example.com/image.png" /> <div>Body</div>' />,
    )

    expect(screen.getByText('Bold').closest('strong')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', 'https://example.com/path')
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/image.png')
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).toContain('Body')
    expect(container.innerHTML).not.toContain('&lt;div')
    expect(container.innerHTML).not.toContain('&lt;strong')
  })
})
