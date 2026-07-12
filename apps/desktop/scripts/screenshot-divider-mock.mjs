import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const path = join(__dirname, '..', '..', '..', 'prototype', 'item-workspace-divider-mock.html')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 500 } })
  await page.goto('file:///' + path.replace(/\\/g, '/'))
  await page.waitForSelector('.item-workspace-pane')
  await page.screenshot({ path: join(__dirname, 'item-workspace-divider-mock.png'), fullPage: false })
  await browser.close()
  console.log('saved item-workspace-divider-mock.png')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
