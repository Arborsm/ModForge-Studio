import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * Visual verification for the map editor inspector's 内容 tab.
 *
 * Drives the real product path in the browser dev mock: creates a project,
 * seeds a map asset carrying every content-tab section (warps on all three
 * carriers, a door, a day/night swap, a tile animation, light-marker
 * objects), opens the editor and switches to the 内容 tab. Asserts the
 * compact flat-row layout: every section header stays above the fold, warp
 * rows lead with the carrier tag, all row text shares one left edge, long
 * lists collapse behind 查看全部, selecting a marker swaps in the inline
 * details head, a single-kind object section does not repeat a subgroup
 * title, and a door row's edit entry opens the studio pre-picked on the door
 * cell. Runs light at 1680 and 1440. Screenshots land in the system
 * temp dir unless overridden via MODFORGE_MAP_CONTENT_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_MAP_CONTENT_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-map-content-tab')
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
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = ((crc ^ byte) & 0xff) ^ (crc >>> 8)
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
  const tileset = (firstGid, name, hueOffset, animations = {}) => ({
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
    animations,
  })
  const marker = (id, x, y) => ({
    id,
    name: 'TileData',
    type: '',
    x,
    y,
    width: 16,
    height: 16,
    rotation: 0,
    visible: true,
    gid: null,
    template: null,
    class: null,
    properties: {},
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
    properties: {
      Warp: '2 7 Town 48 51\n9 7 Beach 13 46\n11 7 Mountain 0 30',
      // Door at (0,0): that Buildings cell carries gid 17 (paths tile 0), so
      // the door edit dialog can re-derive the door tile from the cell.
      Doors: '0 0 2 0',
      DayTiles: 'Back 5 5 2',
      NightTiles: 'Back 5 5 9',
    },
    tilesets: [
      tileset(1, 'indoor', 0, {
        5: [
          { tileId: 5, duration: 100 },
          { tileId: 6, duration: 100 },
        ],
      }),
      tileset(17, 'paths', 90),
    ],
    layers: [layer(1, 'Back', full), layer(2, 'Buildings', sparse), layer(3, 'Front', empty)],
    objectGroups: [
      {
        id: 1,
        name: 'Tiles',
        kind: 'object',
        visible: true,
        opacity: 1,
        drawOrder: 'topdown',
        properties: {},
        objects: [marker(1, 32, 32), marker(2, 64, 32), marker(3, 96, 32)],
      },
    ],
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
    for (const url of process.env.MODFORGE_MAP_CONTENT_URL ? [process.env.MODFORGE_MAP_CONTENT_URL] : fallbackUrls) {
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
    await projectFields.nth(0).fill('Map Content UI Verify')
    await projectFields.nth(1).fill('Arbor.MapContentUiVerify')
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
    await page.locator('.top-menu-project-menu-item', { hasText: 'Map Content UI Verify' }).first().click()
    await page.waitForTimeout(1000)
    await skipGuides()

    // 3. Open the project map through the asset library session path.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('[data-asset-path="assets/maps/Untitled.tmx"] .asset-library-asset-main').first().click()
    await page.getByRole('button', { name: '地图编辑器', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()

    // 4. Switch to the 内容 tab.
    const contentTab = page.locator('.map-asset-inspector-tab[data-guide="map-inspector-map"]')
    if ((await contentTab.count()) !== 1) failures.push('content tab anchor missing')
    await contentTab.click()
    await page.waitForSelector('.map-asset-card-section', { state: 'visible', timeout: 10_000 })

    const sectionCount = await page.locator('.map-asset-card-section').count()
    if (sectionCount !== 5) failures.push(`expected 5 content sections (warps/doors/day-night/animation/objects), found ${sectionCount}`)

    // 5. Compact layout: every section header is above the fold without scrolling.
    const fold = await page.evaluate(() => {
      const content = document.querySelector('.map-asset-inspector-content')
      const headers = [...document.querySelectorAll('.map-asset-card-section > header')]
      return {
        scrollTop: content?.scrollTop ?? -1,
        contentBottom: content?.getBoundingClientRect().bottom ?? -1,
        lastHeaderTop: headers.length ? headers[headers.length - 1].getBoundingClientRect().top : -1,
      }
    })
    if (fold.scrollTop !== 0) failures.push(`content tab scrolled on open (scrollTop=${fold.scrollTop})`)
    if (fold.lastHeaderTop < 0 || fold.lastHeaderTop >= fold.contentBottom) {
      failures.push(`last section header is below the fold (${Math.round(fold.lastHeaderTop)} vs ${Math.round(fold.contentBottom)})`)
    }

    // 6. Warp rows lead with the carrier tag.
    const warpRow = page.locator('.map-asset-card-section').first().locator('.map-asset-entry-card').first()
    const carrierTag = warpRow.locator('.map-asset-entry-tag')
    const tagCount = await carrierTag.count()
    if (tagCount === 0) failures.push('warp rows missing the carrier tag')
    else {
      const tagText = (await carrierTag.first().textContent()) ?? ''
      if (!tagText.includes('地图属性')) failures.push(`first warp carrier tag should be 地图属性, got "${tagText}"`)
    }

    // 6b. One row grid: entry, animation and object rows share a left edge,
    // and the pure-text rows (warp summary / object label) share a text edge.
    const rowLefts = await page.evaluate(() => {
      const left = (selector) => document.querySelector(selector)?.getBoundingClientRect().left ?? null
      return {
        warpRow: left('.map-asset-card-section:first-child .map-asset-entry-card'),
        animationRow: left('.map-asset-animation-list-item'),
        objectRow: left('.map-asset-object-row'),
        warpText: left('.map-asset-card-section:first-child .map-asset-entry-card-text'),
        objectText: left('.map-asset-object-row > button:first-child'),
      }
    })
    if (Object.values(rowLefts).some((value) => value == null)) {
      failures.push(`row alignment probes missing: ${JSON.stringify(rowLefts)}`)
    } else {
      const rowSpread =
        Math.max(rowLefts.warpRow, rowLefts.animationRow, rowLefts.objectRow) -
        Math.min(rowLefts.warpRow, rowLefts.animationRow, rowLefts.objectRow)
      if (rowSpread > 1) failures.push(`content-tab rows not left-aligned (${rowSpread.toFixed(1)}px spread: ${JSON.stringify(rowLefts)})`)
      const textSpread = Math.abs(rowLefts.warpText - rowLefts.objectText)
      if (textSpread > 1) failures.push(`row text edges not aligned (${textSpread.toFixed(1)}px: ${JSON.stringify(rowLefts)})`)
    }

    // 7. Long lists collapse: 3 seeded warps → 2 rows + view-all link.
    const warpSection = page.locator('.map-asset-card-section').first()
    if ((await warpSection.locator('.map-asset-entry-card').count()) !== 2) failures.push('warps did not collapse to 2 rows')
    if ((await warpSection.locator('.map-asset-more-link').count()) !== 1) failures.push('warps missing the view-all link')

    // 8. Day/night row composes day ⇄ night thumbs (previews decode async — wait for them).
    const dayNightRow = page.locator('.map-asset-card-section').nth(2).locator('.map-asset-entry-card').first()
    try {
      await dayNightRow.locator('.map-asset-tile-ref-img').first().waitFor({ state: 'visible', timeout: 10_000 })
    } catch {
      failures.push('day/night row thumbnails never loaded')
    }
    if ((await dayNightRow.locator('.map-asset-tile-ref-img').count()) < 2) failures.push('day/night row missing day+night thumbs')

    // 9. Animation rows keep live previews (same async decode).
    const animationSection = page.locator('.map-asset-card-section').nth(3)
    try {
      await animationSection.locator('.map-anim-preview').first().waitFor({ state: 'visible', timeout: 10_000 })
    } catch {
      failures.push('animation live preview never loaded')
    }
    if ((await animationSection.locator('.map-asset-animation-list-item').count()) !== 1)
      failures.push('animation list missing its group row')
    if ((await animationSection.locator('.map-anim-preview').count()) !== 1) failures.push('animation row missing its live preview')

    // 9b. Door rows expose the edit entry; it opens the studio pre-picked on
    // the door's cell (Buildings · (0, 0)) under the edit title.
    const doorRow = page.locator('.map-asset-card-section').nth(1).locator('.map-asset-entry-card').first()
    await doorRow.hover()
    await doorRow.locator('.map-asset-entry-card-action').first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const editDialog = page.locator('.app-dialog')
    if ((await editDialog.count()) !== 1) failures.push('door edit dialog did not open')
    else {
      const dialogText = (await editDialog.first().textContent()) ?? ''
      if (!dialogText.includes('编辑门')) failures.push(`door edit dialog title should be 编辑门, got "${dialogText.slice(0, 120)}"`)
      if (!dialogText.includes('Buildings · (0, 0)')) failures.push('door edit dialog did not pre-pick the door cell')
    }
    await page.screenshot({ path: `${screenshotDir}/04-door-edit-dialog.png` })
    await page.locator('.app-dialog').getByRole('button', { name: '取消', exact: true }).click()
    await page.waitForSelector('.app-dialog', { state: 'hidden', timeout: 10_000 })

    // 10. Marker rows list without per-row icons; hover reveals the locate action.
    const markerRow = page.locator('.map-asset-object-row').first()
    if ((await page.locator('.map-asset-object-row').count()) !== 3) failures.push('expected 3 marker rows')
    const locateVisibility = await markerRow.locator('.icon-button').evaluate((node) => getComputedStyle(node).visibility)
    if (locateVisibility !== 'hidden') failures.push('marker locate action should be hidden before hover')

    // 10b. Single-kind object section (markers only) must not echo a subgroup
    // title below the section head.
    const objectSection = page.locator('.map-asset-card-section').nth(4)
    if ((await objectSection.locator('.map-asset-subgroup').count()) !== 0) {
      failures.push('single-kind object section should not repeat a subgroup title')
    }

    await page.screenshot({ path: `${screenshotDir}/01-content-default.png` })

    // 11. Selecting a marker swaps in the inline details head (no big card).
    await markerRow.locator('button').first().click()
    await page.waitForSelector('.map-asset-object-details', { state: 'visible', timeout: 10_000 })
    const detailsHeight = await page.locator('.map-asset-object-details').evaluate((node) => node.getBoundingClientRect().height)
    if (detailsHeight > 220) failures.push(`object details block too tall (${Math.round(detailsHeight)}px)`)
    await page.screenshot({ path: `${screenshotDir}/02-content-marker-selected.png` })

    // 12. Narrow width keeps the flat rows inside the panel.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(500)
    const overflow = await page.evaluate(() => {
      const content = document.querySelector('.map-asset-inspector-content')
      return content ? content.scrollWidth - content.clientWidth : 0
    })
    if (overflow > 1) failures.push(`1440px: content tab overflows horizontally by ${overflow}px`)
    await page.screenshot({ path: `${screenshotDir}/03-content-1440.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`map content tab UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`map content tab UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
