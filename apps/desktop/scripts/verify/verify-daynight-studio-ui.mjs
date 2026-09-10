import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * Visual + behavior verification for the reworked day/night studio dialog:
 * - the map picker uses the shared ViewportZoomToolbar pill
 *   (`.map-sheet-canvas-toolbar` inside `.map-cell-picker`);
 * - left-drag on the map rectangle-selects cells and the summary shows the
 *   picked W×H rect, plus a composed day-region preview;
 * - the night sheet appears for valid picks and clicking a tile picks the
 *   night region's top-left origin (size follows the map rect): an origin
 *   that would overflow the sheet warns and disables confirm, a valid origin
 *   renders the composed night preview beside the day one;
 * - confirming writes DayTiles/NightTiles groups and the card list renders the
 *   committed block with inline day/night thumbs.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_DAYNIGHT_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-daynight-studio-ui')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
    tilesets: [tileset(1, 'indoor', 0)],
    layers: [layer(1, 'Back', full)],
    objectGroups: [],
  }
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

  /** Center of sheet tile (col, row), assuming fitView() centered the 64px image at zoom 1. */
  async function sheetTilePoint(col, row) {
    const box = await page.locator('.map-asset-studio-sheet .map-sheet-canvas').boundingBox()
    if (!box) throw new Error('sheet canvas not visible')
    const imageSize = 64
    return {
      x: box.x + (box.width - imageSize) / 2 + col * 16 + 8,
      y: box.y + (box.height - imageSize) / 2 + row * 16 + 8,
    }
  }

  /** Waits until the dialog preview row holds `count` rendered region images. */
  async function waitForPreviewImages(count) {
    await page.waitForFunction(
      (expected) => document.querySelectorAll('.app-dialog .map-asset-daynight-preview .map-asset-tile-ref-img').length === expected,
      count,
      { timeout: 8_000 },
    )
  }

  /** Reads the picked map rect (W, H) from the dialog's picked-cell summary. */
  async function pickedRectSize() {
    const text = (await page.locator('.app-dialog .map-asset-picked-cell span').first().textContent()) ?? ''
    const match = text.match(/起\s*(\d+)×(\d+)/)
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null
  }

  try {
    let opened = null
    for (const url of process.env.MODFORGE_DAYNIGHT_URL ? [process.env.MODFORGE_DAYNIGHT_URL] : fallbackUrls) {
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

    // 1. Create a project and seed a painted map (data-URL tileset).
    await clickRobust(page.getByRole('button', { name: '新建项目' }).first())
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('DayNight Studio Verify')
    await projectFields.nth(1).fill('Arbor.DayNightStudioVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

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
    }, buildSeedDocument())
    await page.locator('.top-menu-project-title').first().click()
    await page.locator('.top-menu-project-menu-item', { hasText: 'DayNight Studio Verify' }).first().click()
    await page.waitForTimeout(1000)
    await skipGuides()

    // 2. Open the seeded map in the map editor and switch to the content tab.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('[data-asset-path="assets/maps/Untitled.tmx"] .asset-library-asset-main').first().click()
    await page.getByRole('button', { name: '地图编辑器', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('.map-asset-inspector-tab', { hasText: '内容' }).first().click()
    await page.waitForSelector('.map-asset-card-section', { state: 'visible', timeout: 10_000 })

    // 3. Open the day/night studio through the day/night section's head ＋ button.
    await page.locator('.map-asset-card-add-head[aria-label="添加昼夜替换"]').click()
    await page.waitForSelector('.map-asset-studio', { state: 'visible', timeout: 10_000 })

    // 3a. The map picker mounts the shared zoom toolbar pill.
    if ((await page.locator('.map-cell-picker .map-sheet-canvas-toolbar').count()) !== 1) {
      failures.push('map picker is missing the shared zoom toolbar pill')
    }
    if ((await page.locator('.map-cell-picker canvas').count()) === 0) {
      failures.push('map picker rendered no canvas')
    }
    await page.screenshot({ path: `${screenshotDir}/01-dialog-initial.png` })

    // 4. Drag a rectangle on the map picker → summary shows the picked rect.
    const mapBox = await page.locator('.map-asset-studio-map .map-cell-picker').boundingBox()
    if (!mapBox) throw new Error('map picker box not measurable')
    await page.mouse.move(mapBox.x + mapBox.width * 0.32, mapBox.y + mapBox.height * 0.42)
    await page.mouse.down()
    await page.mouse.move(mapBox.x + mapBox.width * 0.42, mapBox.y + mapBox.height * 0.42, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    let rect = await pickedRectSize()
    if (!rect) failures.push('map drag did not produce a picked-rect summary (起 W×H)')
    // The seed sheet is 4×4 tiles: fall back to a single-cell click when the
    // drag caught more cells than the sheet can mirror.
    if (rect && (rect.width > 4 || rect.height > 4)) {
      await page.mouse.click(mapBox.x + mapBox.width * 0.32, mapBox.y + mapBox.height * 0.42)
      await page.waitForTimeout(300)
      rect = await pickedRectSize()
    }
    await page.screenshot({ path: `${screenshotDir}/02-map-rect-picked.png` })

    // 5. A valid rect reveals the night sheet and the composed day preview.
    await page.waitForSelector('.map-asset-studio-sheet .map-sheet-canvas', { state: 'visible', timeout: 8_000 })
    await waitForPreviewImages(1).catch(() => failures.push('composed day preview did not render after the map pick'))

    // 6. An origin that pushes the night region past the sheet edge warns and blocks confirm.
    if (rect && (rect.width > 1 || rect.height > 1)) {
      const corner = await sheetTilePoint(3, 3)
      await page.mouse.click(corner.x, corner.y)
      await page.waitForTimeout(300)
      if ((await page.locator('.app-dialog .map-asset-picked-warn', { hasText: '超出图块表边缘' }).count()) !== 1) {
        failures.push('out-of-bounds warning missing for an overflowing night origin')
      }
      const confirmDisabled = await page.locator('.app-dialog button', { hasText: '确定' }).first().isDisabled()
      if (!confirmDisabled) failures.push('confirm stayed enabled while the night region overflowed the sheet')
      await page.screenshot({ path: `${screenshotDir}/03-night-origin-overflow.png` })
    }

    // 7. Clicking a valid origin renders the composed night preview beside the day one.
    const origin = await sheetTilePoint(0, 0)
    await page.mouse.click(origin.x, origin.y)
    await waitForPreviewImages(2).catch(() => failures.push('composed night preview did not render after the origin click'))
    if ((await page.locator('.app-dialog .map-asset-picked-warn', { hasText: '超出图块表边缘' }).count()) !== 0) {
      failures.push('out-of-bounds warning stayed after picking a valid night origin')
    }
    await page.screenshot({ path: `${screenshotDir}/04-night-origin-picked.png` })

    // 8. Confirm commits the swap; the card list renders one block card with inline thumbs.
    if (rect) {
      const confirmEnabled = await page.locator('.app-dialog button', { hasText: '确定' }).first().isEnabled()
      if (!confirmEnabled) failures.push('confirm stayed disabled with a valid night origin')
      await page.locator('.app-dialog button', { hasText: '确定' }).first().click()
      await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 8_000 })
      await page.waitForSelector('.map-asset-tile-ref', { state: 'visible', timeout: 8_000 })
      const cardText = (await page.locator('.map-asset-tile-ref strong').first().textContent()) ?? ''
      if (!/起\s*\d+×\d+/.test(cardText) && !/\(\d+, \d+\)/.test(cardText)) {
        failures.push(`day/night card did not render a recognizable entry title (${cardText})`)
      }
      await page
        .waitForFunction(
          () => document.querySelectorAll('.map-asset-tile-ref .map-asset-entry-thumbs .map-asset-tile-ref-img').length >= 2,
          null,
          { timeout: 8_000 },
        )
        .catch(() => failures.push('committed card did not render inline day+night composed thumbs'))
      await page.screenshot({ path: `${screenshotDir}/05-card-committed.png` })
    }

    // 9. Regression: the door dialog's map picker mounts the same shared toolbar.
    await page.locator('.map-asset-card-add-head[aria-label="添加门"]').click()
    await page.waitForSelector('.map-asset-studio', { state: 'visible', timeout: 10_000 })
    if ((await page.locator('.map-cell-picker .map-sheet-canvas-toolbar').count()) !== 1) {
      failures.push('door dialog map picker is missing the shared zoom toolbar pill')
    }
    await page.screenshot({ path: `${screenshotDir}/06-door-dialog.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`day/night studio UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`day/night studio UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
