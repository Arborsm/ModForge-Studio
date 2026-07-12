/**
 * Capture product UI via Tauri/web:dev mocks, plus marketing site shots.
 *
 * Prerequisites:
 *   - App: `vp run web:dev` (or full desktop host). Default http://127.0.0.1:5175/
 *   - Site: `npx serve website -l 4177` (or any static server)
 *
 * Mock flags (from apps/desktop/src/main.tsx + devLauncherMock):
 *   ?mfLauncherMock=1&mfLauncherMockMods=48
 *   ?mfEventEditorMock=1
 *
 * Usage:
 *   node website/scripts/capture-shots.mjs
 *
 * Env:
 *   APP_URL   default http://127.0.0.1:5175/
 *   SITE_URL  default http://127.0.0.1:4177/
 */
import { chromium } from '../../apps/desktop/node_modules/playwright/index.mjs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../shots')
const appBase = (process.env.APP_URL ?? 'http://127.0.0.1:5175/').replace(/\/?$/, '/')
const siteUrl = process.env.SITE_URL ?? 'http://127.0.0.1:4177/'

async function hideHostToasts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[class*="toast"], [class*="Toast"], [role="status"], [role="alert"]').forEach((el) => {
      const t = el.textContent || ''
      if (t.includes('桌面宿主') || t.includes('desktop host') || t.includes('加载失败') || t.includes('failed')) {
        el.style.display = 'none'
      }
    })
  })
}

async function shot(page, url, name, waitMs = 2600) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })
  await page.waitForTimeout(waitMs)
  await hideHostToasts(page)
  await page.screenshot({ path: path.join(outDir, name), fullPage: false })
  console.log('wrote', name)
}

async function captureApp(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  })

  try {
    await shot(page, `${appBase}?mfLauncherMock=1&mfLauncherMockMods=48`, 'app-launcher-mock.png', 3200)

    // Configuration tab for a second real chrome surface
    for (const sel of ['text=Configuration', 'text=配置']) {
      const el = page.locator(sel).first()
      if (await el.count()) {
        try {
          await el.click({ timeout: 1200 })
          await page.waitForTimeout(1200)
          await hideHostToasts(page)
          await page.screenshot({
            path: path.join(outDir, 'app-configuration-mock.png'),
            fullPage: false,
          })
          console.log('wrote app-configuration-mock.png')
          break
        } catch {
          // ignore
        }
      }
    }

    await shot(page, `${appBase}?mfEventEditorMock=1`, 'app-event-editor-mock.png', 3500)
  } catch (error) {
    console.warn(`[skip] app capture: ${error.message}`)
  } finally {
    await page.close()
  }
}

async function captureSite(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  })

  try {
    await page.goto(siteUrl, { waitUntil: 'networkidle', timeout: 25000 })
  } catch (error) {
    console.warn(`[skip] site capture: ${error.message}`)
    await page.close()
    return
  }

  const forceIn = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in'))
    })
  }

  await page.evaluate(() => {
    localStorage.setItem('modforge-website-theme', 'light')
    localStorage.setItem('modforge-website-locale', 'zh')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await forceIn()
  await page.screenshot({ path: path.join(outDir, 'site-hero-light.png'), fullPage: false })
  console.log('wrote site-hero-light.png')

  await page.evaluate(() => {
    localStorage.setItem('modforge-website-theme', 'dark')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await forceIn()
  await page.screenshot({ path: path.join(outDir, 'site-hero-dark.png'), fullPage: false })
  console.log('wrote site-hero-dark.png')
  await page.screenshot({ path: path.join(outDir, 'site-full-dark.png'), fullPage: true })
  console.log('wrote site-full-dark.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    localStorage.setItem('modforge-website-theme', 'light')
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(350)
  await forceIn()
  await page.screenshot({ path: path.join(outDir, 'site-hero-mobile.png'), fullPage: false })
  console.log('wrote site-hero-mobile.png')

  await page.close()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()
  try {
    await captureApp(browser)
    await captureSite(browser)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
