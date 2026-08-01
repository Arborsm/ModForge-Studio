import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * Visual + geometry verification for the asset library workspace.
 *
 * Drives the real product path in the browser dev mock: creates a project,
 * checks the empty state, seeds project assets through the mock's in-memory
 * asset store (native file dialogs do not exist in the browser), reloads so
 * the draft round-trips, then asserts the polished layout: single primary CTA
 * in the toolbar, header free of action buttons, real lazy image thumbnails,
 * chrome-free detail preview (page-design-spec §6.2), hidden empty dependency
 * sections (§5.3) and a demoted destructive action. Runs light and dark at
 * 1680 and 1440. Screenshots land in the system temp dir unless overridden via
 * MODFORGE_ASSET_LIBRARY_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_ASSET_LIBRARY_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-asset-library-ui')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

// --- Minimal PNG encoder: solid 16x16 tile with a darker bottom quarter, so
// seeded thumbnails are visually distinct without shipping fixture files. ---
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 'ascii')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return chunk
}

function solidPngBase64(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 3)
    const shade = y >= (size * 3) / 4 ? 0.6 : 1
    for (let x = 0; x < size; x += 1) {
      const pixel = rowStart + 1 + x * 3
      raw[pixel] = Math.round(r * shade)
      raw[pixel + 1] = Math.round(g * shade)
      raw[pixel + 2] = Math.round(b * shade)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const failures = []
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`))

  async function skipGuides() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) return
      await skip.first().click()
      await page.waitForTimeout(400)
    }
  }

  async function openAssetLibrary() {
    // Collapsed icon rail hides the label span, so match the stable data-tip.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-workspace', { state: 'visible', timeout: 20_000 })
    await skipGuides()
  }

  try {
    let opened = null
    for (const url of process.env.MODFORGE_ASSET_LIBRARY_URL ? [process.env.MODFORGE_ASSET_LIBRARY_URL] : fallbackUrls) {
      try {
        await page.goto(`${url}${mockQuery}`, { waitUntil: 'domcontentloaded', timeout: 12_000 })
        await page.waitForSelector('.launcher-shell', { state: 'visible', timeout: 45_000 })
        opened = url
        break
      } catch {
        opened = null
      }
    }
    if (!opened) throw new Error('No dev server responded on the candidate ports')

    await page.getByRole('button', { name: '工作台' }).click()
    await page.waitForSelector('.workbench-shell-body', { state: 'visible', timeout: 60_000 })
    await skipGuides()

    // 1. Create a project through the real product path.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Asset UI Verify')
    await projectFields.nth(1).fill('Arbor.AssetUiVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

    // 2. Empty state: no fake thumbnails, import hint visible. Errors must go
    //    through the shared notification system — the dev mock cannot scan game
    //    maps, so the scan failure arrives as a toast, never as an inline banner.
    await openAssetLibrary()
    if ((await page.locator('.asset-library-empty').count()) === 0) failures.push('asset library did not render its empty state')
    if ((await page.locator('.asset-library-error').count()) !== 0) failures.push('asset library still renders an inline error banner')
    const scanToast = page.locator('.notification-toast-title', { hasText: '地图资源扫描失败' })
    if ((await scanToast.count()) === 0) failures.push('map scan failure did not surface through the notification system')
    await page.screenshot({ path: `${screenshotDir}/01-empty-1680.png` })

    // 3. Seed assets through the mock's in-memory store, then reload so the
    //    draft (with synced asset refs) round-trips like a real persisted project.
    const draftStorageKey = await page.evaluate(async () => {
      const drafts = await window.__TAURI_INTERNALS__.invoke('list_cp_maker_drafts')
      return drafts[0]?.draftStorageKey ?? null
    })
    if (!draftStorageKey) throw new Error('mock returned no draft after project creation')
    const assets = [
      { relativePath: 'assets/portrait_abel.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [214, 64, 64]) },
      { relativePath: 'assets/maps/tilesheets/indoor_tiles.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [64, 96, 214]) },
      { relativePath: 'assets/avatar.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [64, 160, 96]) },
      {
        relativePath: 'assets/data/shops.json',
        mediaType: 'application/json',
        bytesBase64: Buffer.from(JSON.stringify({ shops: [] })).toString('base64'),
      },
    ]
    await page.evaluate(
      async ({ draftStorageKey: key, assets: seed }) => {
        await window.__TAURI_INTERNALS__.invoke('write_cp_maker_project_assets', { request: { draftStorageKey: key, assets: seed } })
      },
      { draftStorageKey, assets },
    )
    // The mock keeps state for the page's lifetime, so a reload would wipe it;
    // instead re-select the project from the top-bar project menu, which
    // re-reads the draft (now carrying the seeded asset refs) from the mock store.
    await page.locator('.top-menu-project-title').first().click()
    await page.locator('.top-menu-project-menu-item', { hasText: 'Asset UI Verify' }).first().click()
    await page.waitForTimeout(1000)
    await skipGuides()
    await openAssetLibrary()

    // 4. Populated grid renders every seeded asset.
    await page.waitForFunction((count) => document.querySelectorAll('.asset-library-asset').length === count, assets.length, {
      timeout: 15_000,
    })

    // 5. Lazy image thumbnails load real bytes for every image card, not only
    //    the selected one (regression: tilesheets used to render grey glyphs).
    await page.waitForFunction(() => document.querySelectorAll('.asset-image-thumbnail img').length === 3, null, { timeout: 15_000 })

    // 6. Header carries no action buttons; the single primary CTA lives in the toolbar.
    if ((await page.locator('.asset-library-header button').count()) !== 0) {
      failures.push('asset library header still renders action buttons')
    }
    const toolbarPrimaries = await page.locator('.asset-library-toolbar .control-button-primary').count()
    if (toolbarPrimaries !== 1) failures.push(`expected exactly 1 primary CTA in the toolbar, found ${toolbarPrimaries}`)

    // 7. Toolbar action group hugs the right edge; first-row cards stay aligned.
    const geometry = await page.evaluate(() => {
      const toolbar = document.querySelector('.asset-library-toolbar')?.getBoundingClientRect()
      const actions = document.querySelector('.asset-library-toolbar-actions')?.getBoundingClientRect()
      const cards = [...document.querySelectorAll('.asset-library-asset')].map((node) => node.getBoundingClientRect())
      const browser = document.querySelector('.asset-library-browser')
      return {
        toolbarRight: toolbar?.right ?? 0,
        actionsRight: actions?.right ?? 0,
        firstRowTops: cards.filter((card) => Math.abs(card.top - cards[0].top) < 1).map((card) => card.top),
        cardCount: cards.length,
        horizontalOverflow: browser ? browser.scrollWidth - browser.clientWidth : 0,
        copyHasTooltip: document.querySelector('.asset-library-asset-copy')?.hasAttribute('title') ?? false,
      }
    })
    if (Math.abs(geometry.toolbarRight - geometry.actionsRight) > 20) {
      failures.push(`toolbar actions are not right-aligned (gap ${Math.round(geometry.toolbarRight - geometry.actionsRight)}px)`)
    }
    if (geometry.firstRowTops.length < 2) failures.push('grid first row holds fewer than 2 cards at 1680px')
    if (geometry.horizontalOverflow > 1) failures.push(`asset browser overflows horizontally by ${geometry.horizontalOverflow}px`)
    if (!geometry.copyHasTooltip) failures.push('asset card copy lost its full-path tooltip')
    await page.screenshot({ path: `${screenshotDir}/02-grid-1680.png` })

    // 8. Inspector: chrome-free preview, empty dependency sections hidden,
    //    destructive action demoted to a ghost button.
    await page.locator('.asset-library-asset', { hasText: 'portrait_abel.png' }).first().click()
    await page.waitForSelector('.asset-library-preview img', { state: 'visible', timeout: 15_000 })
    const inspector = await page.evaluate(() => {
      const preview = document.querySelector('.asset-library-preview')
      const previewStyle = preview ? getComputedStyle(preview) : null
      const danger = document.querySelector('.asset-library-actions .control-button.is-danger')
      const dangerStyle = danger ? getComputedStyle(danger) : null
      return {
        previewBorderWidth: previewStyle?.borderTopWidth ?? '',
        previewBackground: previewStyle?.backgroundColor ?? '',
        dependencySections: document.querySelectorAll('.asset-library-dependencies').length,
        emptyDependencyCopy: document.querySelectorAll('.asset-library-dependencies-empty').length,
        dangerBorderColor: dangerStyle?.borderTopColor ?? '',
        dangerBackground: dangerStyle?.backgroundColor ?? '',
      }
    })
    if (inspector.previewBorderWidth !== '0px') failures.push(`detail preview kept a border (${inspector.previewBorderWidth})`)
    if (inspector.previewBackground !== 'rgba(0, 0, 0, 0)' && inspector.previewBackground !== 'transparent') {
      failures.push(`detail preview kept a background (${inspector.previewBackground})`)
    }
    if (inspector.dependencySections !== 0) failures.push('empty dependency sections should be hidden, not rendered')
    if (inspector.emptyDependencyCopy !== 0) failures.push('empty dependency copy leaked back into the inspector')
    if (inspector.dangerBorderColor !== 'rgba(0, 0, 0, 0)' && inspector.dangerBorderColor !== 'transparent') {
      failures.push(`delete action kept button chrome (border ${inspector.dangerBorderColor})`)
    }
    if (inspector.dangerBackground !== 'rgba(0, 0, 0, 0)' && inspector.dangerBackground !== 'transparent') {
      failures.push(`delete action kept a background (${inspector.dangerBackground})`)
    }
    await page.screenshot({ path: `${screenshotDir}/03-inspector-1680.png` })

    // 9. List view keeps thumbnails and single-line rows.
    await page.locator('.asset-library-view-switch button[aria-pressed="false"]').first().click()
    await page.waitForTimeout(400)
    const listThumbnails = await page.locator('.asset-library-assets.is-list .asset-image-thumbnail img').count()
    if (listThumbnails !== 3) failures.push(`list view lost image thumbnails (found ${listThumbnails})`)
    await page.screenshot({ path: `${screenshotDir}/04-list-1680.png` })
    await page.locator('.asset-library-view-switch button[aria-pressed="false"]').first().click()
    await page.waitForTimeout(300)

    // 10. Narrow desktop width and dark theme.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    const narrow = await page.evaluate(() => {
      const browser = document.querySelector('.asset-library-browser')
      return { horizontalOverflow: browser ? browser.scrollWidth - browser.clientWidth : 0 }
    })
    if (narrow.horizontalOverflow > 1) failures.push(`1440px: asset browser overflows horizontally by ${narrow.horizontalOverflow}px`)
    await page.screenshot({ path: `${screenshotDir}/05-grid-1440.png` })
    await page.setViewportSize({ width: 1680, height: 1000 })
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${screenshotDir}/06-grid-dark-1680.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`asset library UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`asset library UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
