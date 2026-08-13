import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * Visual + geometry verification for the map document editor (Tiled-style).
 *
 * Drives the real product path in the browser dev mock: creates a project,
 * seeds a project map asset (bytes are a serialized MapDocument, the mock's
 * documented convention) with two data-URL tilesets, opens it from the map
 * catalog's project section, then asserts the editor layout: the tileset
 * palette stays confined to the canvas column (regression: it used to bleed
 * full-width over the layers panel), palette sheet content stays inside its
 * scroll container, layer rows and statusbar stay readable, and the three
 * columns keep their expected proportions. Runs light and dark at 1680 and
 * 1440. Screenshots land in the system temp dir unless overridden via
 * MODFORGE_MAP_ASSET_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_MAP_ASSET_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-map-asset-editor-ui')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

// --- Minimal PNG encoder (same approach as verify-asset-library-ui). ---
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

  /** Clicks through intermittent guide-tour overlays instead of timing out. */
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

  try {
    let opened = null
    for (const url of process.env.MODFORGE_MAP_ASSET_URL ? [process.env.MODFORGE_MAP_ASSET_URL] : fallbackUrls) {
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
    await projectFields.nth(0).fill('Map Asset UI Verify')
    await projectFields.nth(1).fill('Arbor.MapAssetUiVerify')
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
    await page.locator('.top-menu-project-menu-item', { hasText: 'Map Asset UI Verify' }).first().click()
    await page.waitForTimeout(1000)
    await skipGuides()

    // 3. Open the project map through the current product path: the asset
    //    library inspector's "edit in map editor" action starts a real session.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('[data-asset-path="assets/maps/Untitled.tmx"] .asset-library-asset-main').first().click()
    await page.getByRole('button', { name: '地图编辑器', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()

    // 4. Three-column body and readable layer rows.
    if ((await page.locator('.map-asset-layer-row').count()) !== 3) failures.push('layers panel did not render the three seeded layers')
    const layerFont = await page
      .locator('.map-asset-layer-name')
      .first()
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    if (layerFont < 11) failures.push(`layer name font too small (${layerFont}px)`)

    // 5. The tileset palette floats as a draggable panel inside the viewport.
    //    Stage 2: the default view is the grid (tileset-columns layout).
    await page.waitForSelector('.map-tileset-palette', { state: 'visible', timeout: 15_000 })
    await page.waitForSelector('.map-tileset-palette-virtual', { state: 'visible', timeout: 15_000 })
    if ((await page.locator('.map-tileset-palette-head').count()) !== 1) failures.push('palette panel is missing its drag header')
    const chips = await page.locator('.map-tileset-palette-chip').count()
    if (chips !== 2) failures.push(`expected 2 tileset chips, found ${chips}`)
    const paletteGeometry = await page.evaluate(() => {
      const viewport = document.querySelector('.map-asset-viewport')?.getBoundingClientRect()
      const palette = document.querySelector('.map-tileset-palette')?.getBoundingClientRect()
      const scroll = document.querySelector('.map-tileset-palette-scroll')?.getBoundingClientRect()
      const grid = document.querySelector('.map-tileset-palette-virtual')?.getBoundingClientRect()
      const layers = document.querySelector('.map-asset-layers')?.getBoundingClientRect()
      return {
        viewport: viewport ? { left: viewport.left, right: viewport.right, top: viewport.top } : null,
        palette: palette ? { left: palette.left, right: palette.right, top: palette.top } : null,
        scroll: scroll ? { left: scroll.left, right: scroll.right } : null,
        grid: grid ? { left: grid.left, right: grid.right } : null,
        layersRight: layers?.right ?? 0,
      }
    })
    if (!paletteGeometry.viewport || !paletteGeometry.palette) {
      failures.push('viewport or palette missing from the layout')
    } else {
      if (paletteGeometry.palette.left < paletteGeometry.viewport.left - 1) {
        failures.push(
          `palette bleeds left of the viewport (${Math.round(paletteGeometry.palette.left)} < ${Math.round(paletteGeometry.viewport.left)})`,
        )
      }
      if (paletteGeometry.palette.right > paletteGeometry.viewport.right + 1) {
        failures.push(
          `palette bleeds right of the viewport (${Math.round(paletteGeometry.palette.right)} > ${Math.round(paletteGeometry.viewport.right)})`,
        )
      }
      if (paletteGeometry.palette.left < paletteGeometry.layersRight - 1) {
        failures.push('palette overlaps the layers panel')
      }
      if (paletteGeometry.scroll && paletteGeometry.grid && paletteGeometry.grid.left < paletteGeometry.scroll.left - 1) {
        failures.push('palette grid escapes its scroll container')
      }
    }
    await page.screenshot({ path: `${screenshotDir}/01-editor-1680.png` })

    // 6. Grid cells render and paint their tile from the shared sheet
    //    background; the sheet toggle still swaps to the whole image.
    await page.locator('.map-tileset-palette-view button').nth(1).click()
    await page.waitForTimeout(600)
    if ((await page.locator('.map-tileset-palette-image img').count()) !== 1) failures.push('sheet view image missing')
    await page.locator('.map-tileset-palette-view button').first().click()
    await page.waitForTimeout(600)
    if ((await page.locator('.map-tileset-palette-cell').count()) === 0) failures.push('palette grid view rendered no cells')
    const cellBackground = await page
      .locator('.map-tileset-palette-cell > span')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundImage)
    if (!cellBackground.startsWith('url("data:image/')) {
      failures.push('palette grid cells do not paint the tileset image (missing cell CSS)')
    }
    await page.screenshot({ path: `${screenshotDir}/02-palette-grid.png` })
    await page.locator('.map-tileset-palette-view button').nth(1).click()
    await page.waitForTimeout(400)

    // 6b. Closing the floating palette unmounts it; the viewport keeps its
    //     size because the panel only overlays the canvas. Reopen from the
    //     tool rail's palette toggle.
    const viewportBefore = await page.locator('.map-asset-viewport').evaluate((node) => node.getBoundingClientRect().height)
    await page.getByRole('button', { name: '收起素材托盘' }).click()
    await page.waitForTimeout(400)
    const viewportAfter = await page.locator('.map-asset-viewport').evaluate((node) => node.getBoundingClientRect().height)
    if (Math.abs(viewportAfter - viewportBefore) > 2) {
      failures.push(`closing the floating palette changed the viewport size (${Math.round(viewportBefore)} → ${Math.round(viewportAfter)})`)
    }
    if ((await page.locator('.map-tileset-palette').count()) !== 0) failures.push('palette stayed mounted after closing')
    await page.screenshot({ path: `${screenshotDir}/02b-palette-collapsed.png` })
    await page.getByRole('button', { name: '展开素材托盘' }).click()
    await page.waitForSelector('.map-tileset-palette', { state: 'visible', timeout: 10_000 })

    // 7. Statusbar typography and content.
    const statusbar = await page.locator('.map-asset-statusbar').evaluate((node) => ({
      text: node.textContent ?? '',
      fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
    }))
    if (!statusbar.text.includes('12 × 8')) failures.push(`statusbar lost map dimensions (${statusbar.text})`)
    if (statusbar.fontSize < 10) failures.push(`statusbar font too small (${statusbar.fontSize}px)`)

    // 8. Narrow desktop width and dark theme.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    const narrow = await page.evaluate(() => {
      const body = document.querySelector('.map-asset-editor-body')
      const palette = document.querySelector('.map-tileset-palette')?.getBoundingClientRect()
      const canvas = document.querySelector('.map-asset-canvas')?.getBoundingClientRect()
      return {
        horizontalOverflow: body ? body.scrollWidth - body.clientWidth : 0,
        paletteBleed: palette && canvas ? Math.max(0, palette.right - canvas.right) : 0,
      }
    })
    if (narrow.horizontalOverflow > 1) failures.push(`1440px: editor body overflows horizontally by ${narrow.horizontalOverflow}px`)
    if (narrow.paletteBleed > 1) failures.push(`1440px: palette bleeds ${Math.round(narrow.paletteBleed)}px past the canvas`)
    await page.screenshot({ path: `${screenshotDir}/03-editor-1440.png` })
    await page.setViewportSize({ width: 1680, height: 1000 })
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${screenshotDir}/04-editor-dark-1680.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`map asset editor UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`map asset editor UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
