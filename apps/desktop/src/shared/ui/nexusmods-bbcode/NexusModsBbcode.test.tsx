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

  it('keeps copied NexusMods indent whitespace and visual line starts readable', () => {
    const { container } = render(<NexusModsBbcode source={'[i][u]beds[/u][/i] ﻿1. double bed ﻿ ﻿- double bed ﻿ ﻿- blocky double bed'} />)

    const rendered = container.querySelector('.nexusmods-bbcode')?.textContent ?? ''
    expect(rendered).toContain('1. double bed')
    expect(rendered).toContain('- double bed')
    expect(container.querySelectorAll('br')).toHaveLength(3)
  })

  it('renders decorative furniture section labels as block headings instead of joining the previous line', () => {
    const { container } = render(<NexusModsBbcode source={'﻿- blocky single bed [i] [u]ꕥ end table[/u][/i] ﻿1. wooden end table'} />)

    const heading = screen.getByText('ꕥ end table')
    expect(heading.closest('.nexusmods-bbcode-section-heading')).toBeTruthy()
    expect(heading.closest('.nexusmods-bbcode-section-heading')?.nextSibling?.nodeName).not.toBe('BR')
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toContain('bed - ꕥ')
    expect(container.querySelector('.nexusmods-bbcode')?.textContent).not.toMatch(/\n?\s-\s*ꕥ/u)
  })

  it('does not add an empty line between furniture headings and their first copied NexusMods item', () => {
    const { container } = render(<NexusModsBbcode source={'[i][size=2][u]ꕥ beds[/u][/size][/i] ﻿1. double bed ﻿ ﻿- double bed'} />)

    const heading = screen.getByText('ꕥ beds')
    expect(heading.closest('.nexusmods-bbcode-section-heading')).toBeTruthy()
    expect(heading.closest('.nexusmods-bbcode-section-heading')?.nextSibling?.nodeName).not.toBe('BR')
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('maps copied NexusMods furniture item markers to nested visual indentation', () => {
    const { container } = render(
      <NexusModsBbcode source={'[i][size=2][u]ꕥ beds[/u][/size][/i] ﻿1. double bed ﻿ ﻿- double bed ﻿ ﻿- blocky double bed'} />,
    )

    const indents = Array.from(container.querySelectorAll('.nexusmods-bbcode-indent'))
    expect(indents).toHaveLength(3)
    expect(indents[0]).toHaveClass('nexusmods-bbcode-indent-1')
    expect(indents[1]).toHaveClass('nexusmods-bbcode-indent-2')
    expect(indents[2]).toHaveClass('nexusmods-bbcode-indent-2')
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
})
