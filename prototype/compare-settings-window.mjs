/**
 * Side-by-side mock vs live settings screenshots + HTML compare page.
 * Live app should be started with browser mock, e.g.:
 *   http://127.0.0.1:5181/?mfSettingsMock=1&mfOpenSettings=ai
 *
 * Usage: node prototype/compare-settings-window.mjs [appUrl]
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, 'compare-settings')
const mockHtml = join(__dirname, 'settings-window-redesign-mock.html')
const baseAppUrl = process.argv[2] || 'http://127.0.0.1:5181/'
const require = createRequire(join(__dirname, '../apps/desktop/package.json'))
const { chromium } = require('playwright')

const CATS = [
  { id: 'appearance', mock: 'appearance', label: '外观' },
  { id: 'loading', mock: 'loading', label: '加载' },
  { id: 'view', mock: 'view', label: '视图' },
  { id: 'interaction', mock: 'interaction', label: '交互' },
  { id: 'ai-engine', mock: 'ai', mockAi: 'engine', liveCat: 'ai', liveAi: 'engine', label: 'AI · 默认引擎' },
  { id: 'ai-generative', mock: 'ai', mockAi: 'gen', liveCat: 'ai', liveAi: 'generative', label: 'AI · 生成式' },
  { id: 'ai-mt', mock: 'ai', mockAi: 'mt', liveCat: 'ai', liveAi: 'machine-translation', label: 'AI · 机器翻译' },
  { id: 'ai-semantic', mock: 'ai', mockAi: 'semantic', liveCat: 'ai', liveAi: 'semantic', label: 'AI · 语义' },
  { id: 'ai-usage', mock: 'ai', mockAi: 'usage', liveCat: 'ai', liveAi: 'usage', label: 'AI · 用量' },
  { id: 'debug', mock: 'debug', label: '调试' },
]

function withMockParams(url) {
  const next = new URL(url)
  next.searchParams.set('mfSettingsMock', '1')
  next.searchParams.set('mfOpenSettings', 'ai')
  return next.toString()
}

async function shot(page, file) {
  const path = join(outDir, file)
  await page.screenshot({ path, fullPage: false })
  console.log('shot', path)
  return path
}

async function openLiveSettings(page) {
  const appUrl = withMockParams(baseAppUrl)
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.settings-window-panel', { timeout: 20000 })
  // Wait AI settings to finish first load
  await page.waitForTimeout(800)
}

async function clickLiveCategory(page, id) {
  const tab = page.locator(`#settings-category-${id}`)
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(220)
    return
  }
  const map = { appearance: 0, loading: 1, view: 2, interaction: 3, ai: 4, debug: 5 }
  await page
    .locator('.settings-window-category-tab')
    .nth(map[id] ?? 0)
    .click()
  await page.waitForTimeout(220)
}

async function clickLiveAiTab(page, tabId) {
  const tab = page.locator(`#ai-settings-tab-${tabId}`)
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(350)
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  const results = []

  // —— Mock ——
  const mockPage = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await mockPage.goto(pathToFileURL(mockHtml).href)
  await mockPage.waitForSelector('.panel')

  for (const cat of CATS) {
    await mockPage.click(`.seg-tab[data-cat="${cat.mock}"]`)
    await mockPage.waitForTimeout(100)
    if (cat.mockAi) {
      const sub = mockPage.locator(`.ai-subtab[data-ai="${cat.mockAi}"]`)
      if (await sub.count()) {
        await sub.click()
        await mockPage.waitForTimeout(120)
      }
    }
    if (cat.id === 'loading') {
      const toggle = mockPage.locator('#speed-mode-toggle')
      if (await toggle.count()) {
        await toggle.click()
        await mockPage.waitForTimeout(60)
      }
    }
    const file = `mock-${cat.id}.png`
    await shot(mockPage, file)
    results.push({ id: cat.id, label: cat.label, mock: file })
  }
  await mockPage.close()

  // —— Live app ——
  const livePage = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  try {
    await openLiveSettings(livePage)
    for (const cat of CATS) {
      const liveCat = cat.liveCat ?? cat.id
      await clickLiveCategory(livePage, liveCat)
      if (cat.liveAi) {
        await clickLiveAiTab(livePage, cat.liveAi)
      }
      if (cat.id === 'loading') {
        const fine = livePage.locator('.settings-window-row-group .settings-window-btn').first()
        if (await fine.count()) {
          const expanded = await livePage.locator('.settings-window-row-group.is-expanded').count()
          if (!expanded) {
            await fine.click()
            await livePage.waitForTimeout(80)
          }
        }
      }
      const file = `live-${cat.id}.png`
      await shot(livePage, file)
      const row = results.find((r) => r.id === cat.id)
      if (row) row.live = file
    }
  } catch (err) {
    console.error('Live capture failed:', err)
    for (const row of results) {
      if (!row.live) row.live = null
    }
  }
  await livePage.close()
  await browser.close()

  const appUrl = withMockParams(baseAppUrl)
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>设置窗口：Mock vs Live 对比</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1rem 1.25rem 3rem; background: #12141a; color: #e8e9ee; }
    h1 { font-size: 1.15rem; margin: 0 0 0.35rem; }
    .meta { color: #9aa0ad; font-size: 0.8125rem; margin: 0 0 0.65rem; line-height: 1.5; }
    .links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .links a {
      color: #dbe4ff; text-decoration: none; font-size: 0.8125rem; font-weight: 650;
      padding: 0.4rem 0.75rem; border-radius: 0.5rem; border: 1px solid #334; background: #1a2030;
    }
    .links a:hover { background: #243049; }
    code { font-size: 0.75rem; color: #c9d4ff; }
    nav { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.25rem; position: sticky; top: 0; z-index: 5; padding: 0.5rem 0; background: #12141a; }
    nav a { color: #c9d4ff; text-decoration: none; padding: 0.35rem 0.7rem; border-radius: 999px; border: 1px solid #2a3140; font-size: 0.8125rem; }
    nav a:hover { background: #1c2230; }
    section { margin-bottom: 2.5rem; scroll-margin-top: 3rem; }
    section h2 { font-size: 1rem; margin: 0 0 0.75rem; font-weight: 700; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    figure { margin: 0; border: 1px solid #2a3140; border-radius: 0.75rem; overflow: hidden; background: #0c0e12; }
    figcaption { padding: 0.45rem 0.65rem; font-size: 0.75rem; color: #9aa0ad; border-bottom: 1px solid #2a3140; background: #161922; }
    img { display: block; width: 100%; height: auto; }
    .miss { padding: 2rem; color: #f87171; font-size: 0.875rem; }
    @media (max-width: 1100px) { .pair { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>设置窗口 · Mock vs Live</h1>
  <p class="meta">左栏草图 · 右栏当前实现（含 AI mock 数据） · viewport 1680×1000<br/>
  Live URL: <code>${appUrl}</code><br/>
  重新生成：<code>node prototype/compare-settings-window.mjs ${baseAppUrl}</code></p>
  <div class="links">
    <a href="../settings-window-redesign-mock.html" target="_blank" rel="noreferrer">打开 Mock 草图</a>
    <a href="${appUrl}" target="_blank" rel="noreferrer">打开 Live（AI mock）</a>
  </div>
  <nav>
    ${results.map((r) => `<a href="#${r.id}">${r.label}</a>`).join('')}
  </nav>
  ${results
    .map(
      (r) => `
  <section id="${r.id}">
    <h2>${r.label} <small style="color:#9aa0ad;font-weight:500">(${r.id})</small></h2>
    <div class="pair">
      <figure>
        <figcaption>Mock 草图</figcaption>
        <img src="${r.mock}" alt="mock ${r.id}" />
      </figure>
      <figure>
        <figcaption>Live 实现</figcaption>
        ${r.live ? `<img src="${r.live}" alt="live ${r.id}" />` : `<div class="miss">Live 截图失败</div>`}
      </figure>
    </div>
  </section>`,
    )
    .join('')}
</body>
</html>`

  const indexPath = join(outDir, 'index.html')
  writeFileSync(indexPath, html, 'utf8')
  console.log('compare page:', indexPath)
  console.log('open:', pathToFileURL(indexPath).href)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
