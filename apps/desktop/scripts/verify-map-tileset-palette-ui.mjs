import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

// Playwright must be loaded from its exact pnpm store location.
const require = createRequire(import.meta.url)
const { chromium } = require('E:/Arbor/ModForge Studio/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright')

/**
 * Stage 2 palette verification (mechanical): drives the real product path in
 * the browser dev mock, seeds a project map asset with two 4x4 data-URL
 * tilesets, opens the map editor, then asserts the redesigned palette:
 * wide card + default grid view, search filtering, recents strip, grid box
 * selection with multi-cell highlight, per-sheet remembered selection with
 * chip dots, and the hover preview tooltip. Collects pageerror/console errors
 * and saves screenshots to the repo's `.tmp` directory.
 *
 * Prereq: `vp run web:dev` (port detected from the dev server output).
 */

const fallbackUrls = ['http://127.0.0.1:5181', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = path.resolve('E:/Arbor/ModForge Studio/.tmp')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome-stable',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

// --- Minimal PNG encoder (same approach as verify-map-asset-editor-ui). ---
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

function encodePng(width, height, pixelAt) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y)
      const pixel = rowStart + 1 + x * 3
      raw[pixel] = r
      raw[pixel + 1] = g
      raw[pixel + 2] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}

/** A 4x4-tile 16px tilesheet with a distinct hue per tile. */
function tilesheetPngBase64(hueOffset) {
  return encodePng(64, 64, (x, y) => {
    const tile = Math.floor(y / 16) * 4 + Math.floor(x / 16)
    const hue = (tile * 47 + hueOffset) % 255
    return [hue, (hue * 3) % 255, (hue * 7) % 255]
  })
}

function buildSeedDocument() {
  const width = 12
  const height = 8
  const full = Array.from({ length: width * height }, (_, index) => (index % 16) + 1)
  const sparse = Array.from({ length: width * height }, (_, index) => (index % 7 === 0 ? 17 + (index % 4) : 0))
  const empty = Array.from({ length: width * height }, () => 0)
  const layer = (id, name, gids) => ({
    id,
    name,
    kind: 'tile',
    width,
    height,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids,
    nonEmptyTiles: gids.filter((gid) => gid !== 0).length,
  })
  const tileset = (firstGid, name, hueOffset) => ({
    firstGid,
    name,
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 16,
    columns: 4,
    source: null,
    imageSource: null,
    imagePath: `data:image/png;base64,${tilesheetPngBase64(hueOffset)}`,
    imageWidth: 64,
    imageHeight: 64,
    properties: {},
    tileProperties: {},
    animations: {},
  })
  return {
    name: 'Untitled',
    format: 'tmx',
    sourcePath: 'assets/maps/Untitled.tmx',
    relativePath: 'assets/maps/Untitled.tmx',
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [tileset(1, 'indoor', 0), tileset(17, 'paths', 90)],
    layers: [layer(1, 'Back', full), layer(2, 'Buildings', sparse), layer(3, 'Front', empty)],
    objectGroups: [],
  }
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true })
  const failures = []

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console error: ${message.text()}`)
  })

  async function skipGuides() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) return
      await skip.first().click()
      await page.waitForTimeout(400)
    }
  }

  async function clickRobust(locator) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await locator.click({ timeout: 8_000 })
        return
      } catch {
        await skipGuides()
      }
    }
    await locator.click()
  }

  async function expectTrue(condition, message) {
    if (!condition) failures.push(message)
    return condition
  }

  try {
    let opened = null
    for (const url of fallbackUrls) {
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
    await clickRobust(page.getByRole('button', { name: '新建项目' }).first())
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Palette Stage 2 Verify')
    await projectFields.nth(1).fill('Arbor.PaletteStage2Verify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

    // 2. Seed the map asset, then re-select the project so the draft re-reads.
    const seedDocument = buildSeedDocument()
    await page.evaluate(async (document) => {
      const drafts = await window.__TAURI_INTERNALS__.invoke('list_cp_maker_drafts')
      const draftStorageKey = drafts[0]?.draftStorageKey
      await window.__TAURI_INTERNALS__.invoke('write_cp_maker_project_assets', {
        request: {
          draftStorageKey,
          assets: [
            {
              relativePath: 'assets/maps/Untitled.tmx',
              mediaType: 'application/json',
              bytesBase64: btoa(unescape(encodeURIComponent(JSON.stringify(document)))),
            },
          ],
        },
      })
    }, seedDocument)
    await page.locator('.top-menu-project-title').first().click()
    await page.locator('.top-menu-project-menu-item', { hasText: 'Palette Stage 2 Verify' }).first().click()
    await page.waitForTimeout(1000)
    await skipGuides()

    // 3. Open the project map through the product path.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('[data-asset-path="assets/maps/Untitled.tmx"] .asset-library-asset-main').first().click()
    await page.getByRole('button', { name: '地图编辑器', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.waitForSelector('.map-tileset-palette', { state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(800)

    // ===== Scenario A: wide card + default grid view + search box =====
    const paletteBox = await page.locator('.map-tileset-palette').boundingBox()
    if (!paletteBox) {
      failures.push('palette panel missing')
    } else {
      await expectTrue(paletteBox.width >= 400 && paletteBox.width <= 460, `palette width not ~26rem (${Math.round(paletteBox.width)}px)`)
    }
    await expectTrue((await page.locator('.map-tileset-palette-virtual').count()) === 1, 'grid view is not the default (no virtual grid)')
    const gridCells = await page.locator('.map-tileset-palette-cell').count()
    await expectTrue(gridCells === 16, `expected 16 grid cells for the 4x4 tileset, found ${gridCells}`)
    await expectTrue((await page.locator('.map-tileset-palette-chip').count()) === 2, 'expected 2 tileset chips')
    await expectTrue((await page.locator('.map-tileset-palette-search input').count()) === 1, 'palette search input missing')
    await expectTrue((await page.locator('.map-tileset-palette-foot').count()) === 1, 'palette footer missing')
    await page.screenshot({ path: `${screenshotDir}/impl-stage2-01-default-grid.png` })

    // ===== Scenario B: search filters the chip strip =====
    await page.locator('.map-tileset-palette-search input').fill('path')
    await page.waitForTimeout(300)
    const filteredChips = await page.locator('.map-tileset-palette-chip').count()
    await expectTrue(filteredChips === 1, `search 'path' should leave 1 chip, found ${filteredChips}`)
    const chipText = (await page.locator('.map-tileset-palette-chip').first().textContent()) ?? ''
    await expectTrue(chipText.includes('paths'), `filtered chip is not 'paths' (${chipText})`)
    await page.screenshot({ path: `${screenshotDir}/impl-stage2-02-search-filter.png` })
    await page.locator('.map-tileset-palette-search input').fill('')
    await page.waitForTimeout(300)
    await expectTrue((await page.locator('.map-tileset-palette-chip').count()) === 2, 'clearing search should restore both chips')

    // ===== Scenario C: grid box selection with multi-cell highlight =====
    const cell0 = await page.locator('.map-tileset-palette-cell').nth(0).boundingBox()
    const cell5 = await page.locator('.map-tileset-palette-cell').nth(5).boundingBox()
    if (!cell0 || !cell5) {
      failures.push('grid cells have no bounding box')
    } else {
      await page.mouse.move(cell0.x + cell0.width / 2, cell0.y + cell0.height / 2)
      await page.mouse.down()
      await page.mouse.move(cell5.x + cell5.width / 2, cell5.y + cell5.height / 2, { steps: 8 })
      await page.screenshot({ path: `${screenshotDir}/impl-stage2-03-box-select-drag.png` })
      await page.mouse.up()
      await page.waitForTimeout(400)
      const selectedCells = await page.locator('.map-tileset-palette-cell.is-sel').count()
      await expectTrue(selectedCells === 4, `box select 0,0→1,1 should highlight 4 cells, found ${selectedCells}`)
      const footerText = (await page.locator('.map-tileset-palette-foot-selection').textContent()) ?? ''
      await expectTrue(footerText.includes('2 x 2'), `footer selection should read 2 x 2 (${footerText})`)
      await expectTrue(
        (await page.locator('.map-tileset-palette-recent').count()) === 1,
        'recents strip should show 1 entry after selection',
      )
      await page.screenshot({ path: `${screenshotDir}/impl-stage2-04-box-select-committed.png` })
    }

    // ===== Scenario D: per-sheet remembered selection + chip dots =====
    await page.locator('.map-tileset-palette-chip', { hasText: 'paths' }).click()
    await page.waitForTimeout(400)
    const pathsCells = await page.locator('.map-tileset-palette-cell').count()
    await expectTrue(pathsCells === 16, `paths grid should render 16 cells, found ${pathsCells}`)
    await expectTrue(
      (await page.locator('.map-tileset-palette-chip-mem').count()) === 1,
      'switching away should leave a memory dot on indoor',
    )
    // paths has no remembered selection: switching commits its first tile
    const pathsFooter = (await page.locator('.map-tileset-palette-foot-selection').textContent()) ?? ''
    await expectTrue(
      pathsFooter.includes('paths') && pathsFooter.includes('1 x 1'),
      `paths sheet should start on its first tile (${pathsFooter})`,
    )
    // pick a single tile on paths, then switch back to indoor
    await page.locator('.map-tileset-palette-cell').nth(2).click()
    await page.waitForTimeout(300)
    await page.locator('.map-tileset-palette-chip', { hasText: 'indoor' }).click()
    await page.waitForTimeout(400)
    const restoredCells = await page.locator('.map-tileset-palette-cell.is-sel').count()
    await expectTrue(restoredCells === 4, `switching back should restore the indoor 2x2 selection, found ${restoredCells} highlighted`)
    await expectTrue((await page.locator('.map-tileset-palette-chip-mem').count()) === 2, 'both chips should now carry memory dots')
    await page.screenshot({ path: `${screenshotDir}/impl-stage2-05-restored-selection-dots.png` })

    // ===== Scenario E: hover preview tooltip =====
    await page.locator('.map-tileset-palette-cell').nth(1).hover()
    await page.waitForTimeout(400)
    const tip = page.locator('.map-tileset-palette-tip')
    await expectTrue((await tip.count()) === 1, 'hover tooltip did not appear')
    if ((await tip.count()) === 1) {
      const tipText = (await tip.textContent()) ?? ''
      await expectTrue(tipText.includes('indoor'), `tooltip should name the tileset (${tipText})`)
      await expectTrue((await tip.locator('.map-tileset-palette-tip-image').count()) === 1, 'tooltip preview image missing')
      await page.screenshot({ path: `${screenshotDir}/impl-stage2-06-hover-tooltip.png` })
    }
    await page.mouse.move(0, 0)
    await page.waitForTimeout(200)
    await expectTrue((await page.locator('.map-tileset-palette-tip').count()) === 0, 'tooltip should hide after the pointer leaves')

    // ===== Scenario F: recents restore + zoom control =====
    // The strip is most-recent-first: [paths 1x1, indoor 2x2]; the last entry
    // is the indoor box selection committed earlier.
    await page.locator('.map-tileset-palette-recent').last().click()
    await page.waitForTimeout(300)
    const recentFooter = (await page.locator('.map-tileset-palette-foot-selection').textContent()) ?? ''
    await expectTrue(
      recentFooter.includes('2 x 2') && recentFooter.includes('indoor'),
      `clicking a recent should restore its selection (${recentFooter})`,
    )
    await page.locator('.map-tileset-palette-zoom').getByRole('button', { name: '放大' }).click()
    await page.waitForTimeout(300)
    const zoomValue = (await page.locator('.map-tileset-palette-zoom-value').textContent()) ?? ''
    await expectTrue(zoomValue.includes('150'), `zoom in should show 150% (${zoomValue})`)
    await page.screenshot({ path: `${screenshotDir}/impl-stage2-07-recents-zoom.png` })

    // ===== Scenario G: sheet view still works =====
    await page.locator('.map-tileset-palette-view button').nth(1).click()
    await page.waitForTimeout(400)
    await expectTrue((await page.locator('.map-tileset-palette-image img').count()) === 1, 'sheet view image missing')
    await page.screenshot({ path: `${screenshotDir}/impl-stage2-08-sheet-view.png` })

    if (failures.length > 0) {
      console.error(`palette stage 2 verification failed:\n- ${failures.join('\n- ')}`)
      process.exit(1)
    }
    console.log(`palette stage 2 verification passed; screenshots in ${screenshotDir}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
