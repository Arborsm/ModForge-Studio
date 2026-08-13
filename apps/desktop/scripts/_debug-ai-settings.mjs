import { chromium } from 'playwright'

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: chromiumExecutable, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } })
const logs = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`))
await page.goto('http://127.0.0.1:5173/?mfSettingsMock=1&mfOpenSettings=ai', { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(8000)
const state = await page.evaluate(() => {
  const panel = document.querySelector('#ai-settings-panel-generative')
  const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => ({
    text: tab.textContent?.trim(),
    selected: tab.getAttribute('aria-selected'),
  }))
  const settingsWindow = document.querySelector('.settings-window, .settings-ai-section')
  return {
    tabs,
    generativeHidden: panel ? panel.getAttribute('hidden') : 'no-panel',
    generativeText: panel?.textContent?.slice(0, 300) ?? '',
    settingsWindowClass: settingsWindow?.className ?? '',
    settingsWindowText: settingsWindow?.textContent?.slice(0, 300) ?? '',
    errorText: document.querySelector('.settings-ai-error')?.textContent ?? null,
    importPreview: Boolean(document.querySelector('.settings-ai-import-preview')),
  }
})
console.log(JSON.stringify({ state, logs: logs.slice(0, 20) }, null, 2))
await page.screenshot({ path: 'C:/Users/26537/AppData/Local/Temp/modforge-debug-ai-settings2.png', fullPage: false })
await browser.close()
