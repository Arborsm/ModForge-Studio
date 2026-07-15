import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, 'settings-window-redesign-mock.html')
const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

async function shot(page, file) {
  const path = join(__dirname, file)
  await page.screenshot({ path, fullPage: false })
  console.log('screenshot:', path)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForSelector('.panel')

  await page.click('.ai-subtab[data-ai="engine"]')
  await page.waitForTimeout(100)
  await shot(page, 'settings-window-redesign-b-ai-engine.png')

  await page.click('.ai-subtab[data-ai="semantic"]')
  await page.waitForTimeout(100)
  await page.click('[data-action="run-probe"]')
  await page.waitForTimeout(120)
  await page.evaluate(() => {
    const sc = document.querySelector('.ai-scroll')
    if (sc) sc.scrollTop = sc.scrollHeight
  })
  await page.waitForTimeout(80)
  await shot(page, 'settings-window-redesign-b-ai-semantic.png')

  await page.click('[data-action="verify-model"]')
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    const sc = document.querySelector('.ai-scroll')
    if (sc) sc.scrollTop = 0
  })
  await page.waitForTimeout(60)
  await shot(page, 'settings-window-redesign-b-ai-semantic-verify.png')

  await page.click('.ai-subtab[data-ai="gen"]')
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    const sc = document.querySelector('.ai-scroll')
    if (sc) sc.scrollTop = 0
  })
  // open preset pick to show longest-option width
  await page.click('#panel-gen .mf-pick-trigger')
  await page.waitForTimeout(80)
  await shot(page, 'settings-window-redesign-b-ai.png')
  // close menu for subsequent shots
  await page.evaluate(() => {
    document.querySelectorAll('.mf-pick.is-open').forEach((p) => {
      p.classList.remove('is-open')
      const m = p.querySelector('.mf-pick-menu')
      if (m) m.hidden = true
    })
  })

  await page.click('[data-action="test-gen"]')
  await page.waitForTimeout(80)
  await shot(page, 'settings-window-redesign-b-ai-test.png')

  await page.click('.ai-subtab[data-ai="mt"]')
  await page.waitForTimeout(80)
  await shot(page, 'settings-window-redesign-b-ai-mt.png')

  await page.click('.ai-subtab[data-ai="usage"]')
  await page.waitForTimeout(120)
  await page.evaluate(() => {
    const sc = document.querySelector('.ai-scroll')
    if (sc) sc.scrollTop = sc.scrollHeight
  })
  await page.waitForTimeout(60)
  await shot(page, 'settings-window-redesign-b-ai-usage.png')

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
