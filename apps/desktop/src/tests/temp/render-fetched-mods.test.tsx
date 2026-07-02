import fs from 'node:fs'
import path from 'node:path'
import ReactDOMServer from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode/NexusModsBbcode'

const tmpDir = path.resolve(process.cwd(), '.claude/tmp')

describe('render fetched Nexus mod descriptions', () => {
  it('renders all fetched raw sources to HTML', { timeout: 60000 }, () => {
    const files = fs.readdirSync(tmpDir).filter((name) => /^nexus-raw-(\d+)\.txt$/.test(name))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const modId = file.match(/^nexus-raw-(\d+)\.txt$/)?.[1]
      if (!modId) continue

      const source = fs.readFileSync(path.join(tmpDir, file), 'utf8')
      const html = ReactDOMServer.renderToStaticMarkup(<NexusModsBbcode source={source} />)
      fs.writeFileSync(path.join(tmpDir, `nexus-our-${modId}.html`), html)
    }
  })
})
