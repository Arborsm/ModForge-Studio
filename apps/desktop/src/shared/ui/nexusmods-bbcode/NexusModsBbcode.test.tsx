import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NexusModsBbcode } from './NexusModsBbcode'

describe('NexusModsBbcode', () => {
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
