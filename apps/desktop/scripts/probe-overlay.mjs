import { chromium } from 'playwright'
const gameRoot = process.env.SDV_GAME_PATH
const url = `http://127.0.0.1:5175/?mfPagePerfScenario=map-asset-editor&mfEventEditorAssetBridge=1&mfGameRoot=${encodeURIComponent(gameRoot)}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
const page = await browser.newPage()
const failed = []
page.on('response', (res) => {
  if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`)
})
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(5000)
console.log('failed requests:', JSON.stringify(failed, null, 2))
const overlayText = await page.locator('vite-error-overlay').evaluate((el) => el.shadowRoot?.textContent?.slice(0, 1500) ?? 'none')
console.log('overlay:', overlayText)
await browser.close()
