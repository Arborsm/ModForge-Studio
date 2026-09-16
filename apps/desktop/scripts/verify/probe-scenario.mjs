import { chromium } from 'playwright'
const gameRoot = process.env.SDV_GAME_PATH
const url = `http://127.0.0.1:5175/?mfPagePerfScenario=map-asset-editor&mfEventEditorAssetBridge=1&mfGameRoot=${encodeURIComponent(gameRoot)}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
page.on('console', (msg) => {
  if (msg.type() !== 'debug') console.log('[console]', msg.type(), msg.text().slice(0, 400))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
console.log('html head:', (await page.content()).slice(0, 200))
console.log('has editor:', await page.locator('.map-asset-editor').count())
console.log('overlay:', await page.locator('vite-error-overlay').count())
await browser.close()
