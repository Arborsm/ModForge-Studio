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
 * the draft round-trips, then asserts the polished layout: a single import
 * split button in the toolbar (all other import entries live in its popover),
 * header free of action buttons, real lazy image thumbnails, chrome-free
 * detail preview (page-design-spec §6.2), hidden empty dependency sections
 * (§5.3), full-width stacked inspector actions, and danger buttons with real
 * button chrome. It also verifies the classify/group/multi-select slices:
 * TMX/TBIN maps read 地图 (never 其他), the all-filter grid groups cards under
 * canonical kind headers, and a real mouse drag box-selects two cards whose
 * batch delete goes through the shared Dialog. The replacement family picker
 * and the binding editor both open as shared Dialogs while the asset grid
 * stays mounted underneath. Batch 2 slices: the bindings header collapses to
 * one row with a ＋ icon button and no hint paragraph, the binding editor is a
 * single-page two-stage flow (thumbnail target grid + dashed file-select
 * block, no numbered step or count badges, no expert-mode hints) whose dialog
 * title reads 新建替换 → 替换图片 · {target} and whose footer carries the live
 * effect status 还差… → 已生效 → 已停用 with a working 启用 recovery, the
 * subtitle carries the raw target expression, replacement rows are flat (no
 * state badge, delete button only visible on hover, disabled rows dim to 45%),
 * the toolbar carries an auto-save dot and a CompactSelect
 * filter (no native select, no "showing N of M" counter), and "编辑地图"
 * mounts the map editor inside the asset library without switching modules
 * (Batch 1 mount API), returning restores the grid with the selection kept.
 * Runs light and dark at 1680 and 1440. Screenshots land in the system temp
 * dir unless overridden via MODFORGE_ASSET_LIBRARY_SCREENSHOT_DIR.
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

// --- Minimal serialized MapDocument for the embedded-editor slice: seeded map
// asset bytes ARE the MapDocument JSON (dev mock convention, see
// docs/dev-verification.md §1.1), so the editor can parse and mount it. ---
function buildSeedMapDocument() {
  const width = 8
  const height = 6
  const full = Array.from({ length: width * height }, (_, index) => (index % 8) + 1)
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
  return {
    name: 'Seed',
    format: 'tmx',
    sourcePath: 'assets/maps/Seed.tmx',
    relativePath: 'assets/maps/Seed.tmx',
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [
      {
        firstGid: 1,
        name: 'seed',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 8,
        columns: 4,
        source: null,
        imageSource: null,
        imagePath: `data:image/png;base64,${solidPngBase64(64, [188, 152, 98])}`,
        imageWidth: 64,
        imageHeight: 64,
        properties: {},
        tileProperties: {},
        animations: {},
      },
    ],
    layers: [layer(1, 'Back', full), layer(2, 'Front', empty)],
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
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) {
        // The tour can mount shortly after the shell; settle before concluding
        // there is nothing to skip.
        await page.waitForTimeout(400)
        if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      }
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) {
        await page.waitForTimeout(400)
        continue
      }
      await skip.first().click()
      await page.waitForTimeout(400)
    }
  }

  async function openAssetLibrary() {
    // Collapsed icon rail hides the label span, so match the stable data-tip.
    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    // The workspace renders as a WorkspaceSplitView without its own root class,
    // so wait on the toolbar row instead.
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await dismissErrorToasts()
  }

  /**
   * Error-level toasts never auto-dismiss, and while one is up its hover
   * region intercepts pointer events over the dialog footer — dismiss them
   * before interacting with anything near the bottom edge. Toasts also land
   * asynchronously after mount, and the close button is pointer-events:none
   * until its toast is hovered, so hover before clicking while polling.
   */
  async function dismissErrorToasts() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) !== 0) await skipGuides()
      const toast = page.locator('.notification-toast').first()
      if ((await toast.count()) === 0) return
      await toast.hover({ timeout: 3000 }).catch(() => {})
      await toast
        .locator('.notification-toast-close')
        .first()
        .click({ timeout: 3000 })
        .catch(() => {})
      await page.waitForTimeout(300)
    }
  }

  /**
   * Imports one game asset kind through the real copy-from-game UI path and
   * asserts the imported card lands in the expected grid group without
   * surfacing an error notification. The import menu opens from the split
   * button's chevron; the picker dialog is opened programmatically by the
   * workspace (openRequest), so only the menu item is clicked here.
   */
  async function importFromGameKind(kindLabel, expectedAssetPath, expectedGroupKind, expectedMetaPrefix) {
    await page.locator('.asset-library-import-split-toggle').click()
    await page.waitForSelector('.asset-library-import-kind-picker', { state: 'visible', timeout: 5_000 })
    await page.getByRole('menuitem', { name: kindLabel, exact: true }).click()
    await page.waitForSelector('.resource-picker__dialog', { state: 'visible', timeout: 8_000 })
    await page.locator('.resource-picker__item-card-main').first().click()
    await page.locator('.resource-picker__button--primary').click()
    await page.waitForFunction(
      (assetPath) => Boolean(document.querySelector(`.asset-library-asset[data-asset-path="${assetPath}"]`)),
      expectedAssetPath,
      { timeout: 15_000 },
    )
    const groupKind = await page.evaluate((assetPath) => {
      let node = document.querySelector(`.asset-library-asset[data-asset-path="${assetPath}"]`)
      while (node) {
        node = node.previousElementSibling
        if (node?.classList.contains('asset-library-kind-header')) return node.getAttribute('data-kind')
      }
      return null
    }, expectedAssetPath)
    if (groupKind !== expectedGroupKind) {
      failures.push(`imported game ${kindLabel} asset ${expectedAssetPath} grouped under "${groupKind}", expected "${expectedGroupKind}"`)
    }
    const meta =
      (await page.locator(`.asset-library-asset[data-asset-path="${expectedAssetPath}"] .asset-library-asset-meta`).textContent()) ?? ''
    if (!meta.startsWith(expectedMetaPrefix)) {
      failures.push(`imported game ${kindLabel} asset ${expectedAssetPath} meta reads "${meta}", expected prefix "${expectedMetaPrefix}"`)
    }
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
    await dismissErrorToasts()

    // 1. Create a project through the real product path.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Asset UI Verify')
    await projectFields.nth(1).fill('Arbor.AssetUiVerify')
    await dismissErrorToasts()
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

    // 2. Empty state: no fake thumbnails, import hint visible. Errors must go
    //    through the shared notification system — scan problems surface as a
    //    toast, never as an inline banner. The dev mock's map scan now
    //    succeeds (the map workspace verification depends on the mocked
    //    catalog), so the failure toast is not expected here; instead assert
    //    the catalog loaded and the "copy from game" picker appeared.
    await openAssetLibrary()
    if ((await page.locator('.asset-library-empty').count()) === 0) failures.push('asset library did not render its empty state')
    if ((await page.locator('.asset-library-error').count()) !== 0) failures.push('asset library still renders an inline error banner')
    if ((await page.locator('.asset-library-import-split').count()) !== 1)
      failures.push('map catalog did not load in the dev mock (import split button missing)')
    await page.screenshot({ path: `${screenshotDir}/01-empty-1680.png` })

    // 3. Seed assets through the mock's in-memory store, then reload so the
    //    draft (with synced asset refs) round-trips like a real persisted project.
    const draftStorageKey = await page.evaluate(async () => {
      const drafts = await window.__TAURI_INTERNALS__.invoke('list_cp_maker_drafts')
      return drafts[0]?.draftStorageKey ?? null
    })
    if (!draftStorageKey) throw new Error('mock returned no draft after project creation')
    const seedMapDocument = buildSeedMapDocument()
    const assets = [
      { relativePath: 'assets/portrait_abel.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [214, 64, 64]) },
      { relativePath: 'assets/maps/tilesheets/indoor_tiles.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [64, 96, 214]) },
      { relativePath: 'assets/avatar.png', mediaType: 'image/png', bytesBase64: solidPngBase64(16, [64, 160, 96]) },
      {
        relativePath: 'assets/data/shops.json',
        mediaType: 'application/json',
        bytesBase64: Buffer.from(JSON.stringify({ shops: [] })).toString('base64'),
      },
      // Map documents carry no MIME (browsers report octet-stream); they must
      // classify by path extension, not fall into "other".
      {
        relativePath: 'assets/maps/Mountain.tmx',
        mediaType: 'application/octet-stream',
        bytesBase64: Buffer.from('<map version="1.4"><properties></properties></map>').toString('base64'),
      },
      {
        relativePath: 'assets/maps/Festival.tbin',
        mediaType: 'application/octet-stream',
        bytesBase64: Buffer.from('not-a-real-tbin-payload').toString('base64'),
      },
      // A valid map document so the embedded map editor slice can mount it.
      {
        relativePath: 'assets/maps/Seed.tmx',
        mediaType: 'application/json',
        bytesBase64: Buffer.from(JSON.stringify(seedMapDocument), 'utf8').toString('base64'),
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

    // 4.1. TMX/TBIN map documents classify as "map" by path extension, even
    //      with no MIME (slice 1): the meta line reads 地图, not 其他.
    for (const mapPath of ['assets/maps/Mountain.tmx', 'assets/maps/Festival.tbin']) {
      const meta = await page.locator(`.asset-library-asset[data-asset-path="${mapPath}"] .asset-library-asset-meta`).textContent()
      if (!meta || !meta.startsWith('地图')) failures.push(`map asset ${mapPath} meta does not read 地图: "${meta}"`)
      if (meta && meta.includes('其他')) failures.push(`map asset ${mapPath} meta still reads 其他: "${meta}"`)
    }

    // 4.2. All-filter grid groups cards by kind with headers in the canonical
    //      map → image → audio → data → other order; header counts match the
    //      cards that follow (slice 2).
    const groupInfo = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.asset-library-kind-header')]
      const canonical = ['map', 'image', 'audio', 'data', 'other']
      const headerOrder = headers.map((node) => node.getAttribute('data-kind') ?? '')
      let cursor = 0
      const orderValid = headerOrder.every((kind) => {
        const index = canonical.indexOf(kind)
        if (index < cursor) return false
        cursor = index
        return true
      })
      const counts = headers.map((header) => {
        let count = 0
        let node = header.nextElementSibling
        while (node && !node.classList.contains('asset-library-kind-header')) {
          if (node.classList.contains('asset-library-asset')) count += 1
          node = node.nextElementSibling
        }
        return count
      })
      const countTexts = headers.map((header) => header.querySelector('span')?.textContent ?? '')
      return { headerOrder, orderValid, counts, countTexts }
    })
    if (groupInfo.headerOrder.join(',') !== 'map,image,data') {
      failures.push(`unexpected kind header order: ${groupInfo.headerOrder.join(',')}`)
    }
    if (!groupInfo.orderValid) failures.push('kind headers are not in canonical map→image→audio→data→other order')
    if (groupInfo.counts.join(',') !== '3,3,1') failures.push(`kind header card counts mismatch: ${groupInfo.counts.join(',')}`)
    groupInfo.counts.forEach((count, index) => {
      const parsed = Number.parseInt(groupInfo.countTexts[index], 10)
      if (parsed !== count) failures.push(`kind header count text "${groupInfo.countTexts[index]}" does not match its ${count} cards`)
    })

    // 5. Lazy image thumbnails load real bytes for every image card, not only
    //    the selected one (regression: tilesheets used to render grey glyphs).
    await page.waitForFunction(() => document.querySelectorAll('.asset-image-thumbnail img').length === 3, null, { timeout: 15_000 })

    // 4.3. Toolbar slice (Batch 2): auto-save dot with a valid data-state, the
    //      type filter is a CompactSelect button trigger (no native select),
    //      and the "showing N of M" counter is gone.
    if ((await page.locator('.asset-library-toolbar .asset-library-save-dot').count()) !== 1) {
      failures.push('toolbar is missing the auto-save state dot')
    }
    const saveDotState = await page.locator('.asset-library-toolbar .asset-library-save-dot').getAttribute('data-state')
    if (!['saving', 'saved', 'dirty', 'error'].includes(saveDotState ?? '')) {
      failures.push(`save dot has unexpected data-state "${saveDotState}"`)
    }
    if ((await page.locator('.asset-library-toolbar select').count()) !== 0) {
      failures.push('toolbar still renders a native <select> type filter')
    }
    if ((await page.locator('.asset-library-toolbar .compact-select__trigger').count()) !== 1) {
      failures.push('toolbar is missing the CompactSelect filter trigger')
    } else {
      const triggerTag = await page.locator('.asset-library-toolbar .compact-select__trigger').evaluate((node) => node.tagName)
      if (triggerTag !== 'BUTTON') failures.push(`filter trigger is <${triggerTag}>, expected the CompactSelect button`)
    }
    const toolbarText = (await page.locator('.asset-library-toolbar').textContent()) ?? ''
    if (/显示\s*\d+\s*\/\s*\d+\s*项/.test(toolbarText) || /Showing\s+\d+\s+of\s+\d+/.test(toolbarText)) {
      failures.push(`toolbar still shows the "showing N of M" counter text: "${toolbarText.trim()}"`)
    }

    // 4.4. Bindings header slice (Batch 2): one row — bold title, count, and a
    //      ＋ icon button; the hint paragraph and primary action button are gone.
    if ((await page.locator('.asset-library-bindings').count()) !== 1) {
      failures.push('merged layout is missing the left replacements column')
    }
    if ((await page.locator('.asset-library-bindings-hint').count()) !== 0) {
      failures.push('bindings header still renders the hint paragraph')
    }
    if ((await page.locator('.asset-library-bindings-header .icon-button').count()) !== 1) {
      failures.push('bindings header is missing the ＋ new-replacement icon button')
    }
    if ((await page.locator('.asset-library-bindings-header .control-button-primary').count()) !== 0) {
      failures.push('bindings header still renders a primary action button instead of the ＋ icon button')
    }

    // 5.5. Merged two-column layout: creating a replacement from the ＋ icon
    //      button opens the family picker as a shared Dialog, then the binding
    //      editor opens as a single-page two-stage flow in its own Dialog while
    //      the asset grid stays mounted underneath. The dialog names the
    //      binding (新建替换 while unconfigured), the footer carries the live
    //      effect status (还差… → 已生效), and configuring both stages through
    //      the point-and-click pickers flips the status without any reload.
    await page.locator('.asset-library-bindings-header .icon-button').click()
    await page.waitForSelector('.app-dialog .load-family-picker-grid', { state: 'visible', timeout: 5_000 })
    await page.locator('.load-family-picker-card', { hasText: '图片' }).click()
    await page.waitForSelector('.app-dialog .map-load-editor', { state: 'visible', timeout: 10_000 })
    if ((await page.locator('.asset-library-browser').count()) !== 1) {
      failures.push('asset grid unmounted while the replacement editor dialog is open')
    }
    // The old numbered-step cards are gone: no step/count badges, no negative
    // advanced-mode hints, and the unconfigured dialog reads as 新建替换 with
    // the footer naming both missing parts.
    if ((await page.locator('.app-dialog .map-load-card-number').count()) !== 0) {
      failures.push('replacement editor still renders numbered step badges')
    }
    if ((await page.locator('.app-dialog .map-load-card-count').count()) !== 0) {
      failures.push('replacement editor still renders target count badges')
    }
    const editorText = (await page.locator('.app-dialog .map-load-editor').textContent()) ?? ''
    if (editorText.includes('高级模式下使用')) {
      failures.push('replacement editor still renders the expert-only hint')
    }
    if ((await page.locator('.app-dialog .app-dialog-title').textContent()) !== '新建替换') {
      failures.push(
        `unconfigured replacement dialog title should read 新建替换, got "${await page.locator('.app-dialog .app-dialog-title').textContent()}"`,
      )
    }
    const footerStatus = await page.locator('.app-dialog .asset-library-binding-status').textContent()
    if (!footerStatus?.includes('还差') || !footerStatus.includes('替换目标') || !footerStatus.includes('替换文件')) {
      failures.push(`unconfigured replacement footer status should name both missing parts, got "${footerStatus}"`)
    }
    if ((await page.locator('.app-dialog .load-binding-section').count()) !== 3) {
      failures.push('replacement editor should render two stages plus the advanced fold')
    }
    // Stage 1: pick a vanilla image target from the thumbnail grid; the dialog
    // retitles to 替换{family} · {first target} and the footer narrows to the
    // still-missing replacement file.
    await page.locator('.app-dialog .load-binding-thumb-cell').first().click()
    await page.waitForFunction(() => document.querySelector('.app-dialog .app-dialog-title')?.textContent === '替换图片 · Abigail', null, {
      timeout: 5_000,
    })
    // Stage 2: the whole dashed block opens the project-file picker; choose the
    // first project asset and confirm. The footer flips to 已生效 without any
    // save button, and the file row shows the ready badge.
    await page.locator('.app-dialog .load-binding-file-select').click()
    await page.waitForSelector('.resource-picker__dialog', { state: 'visible', timeout: 8_000 })
    await page.locator('.resource-picker__item-card-main').first().click()
    await page.locator('.resource-picker__button--primary').click()
    await page.waitForSelector('.resource-picker__dialog', { state: 'detached', timeout: 8_000 })
    await page.waitForFunction(() => document.querySelector('.app-dialog .asset-library-binding-status')?.textContent === '已生效', null, {
      timeout: 8_000,
    })
    if ((await page.locator('.app-dialog .load-binding-file-row').count()) !== 1) {
      failures.push('configured replacement should show the chosen file row')
    }
    if ((await page.locator('.app-dialog .load-binding-file-row .map-load-status-badge.is-present').count()) !== 1) {
      failures.push('configured replacement file row should carry the ready badge')
    }
    // Single target without tokens: no inline table renders, so stage 2 has no
    // header state — existence lives on the file row badge above.
    if ((await page.locator('.app-dialog .load-binding-section[data-state]').count()) !== 0) {
      failures.push('stage 2 should not render a header state for a single-tokenless target')
    }
    if ((await page.locator('.app-dialog .asset-library-binding-subtitle').textContent()) !== 'Portraits/Abigail') {
      failures.push(
        `dialog subtitle should carry the raw target expression, got "${await page.locator('.app-dialog .asset-library-binding-subtitle').textContent()}"`,
      )
    }
    // The primary done action stays a pure close: closing returns to the grid
    // with the configured row kept in the list.
    const doneButton = page.locator('.app-dialog').getByRole('button', { name: '完成', exact: true })
    if ((await doneButton.count()) !== 1) {
      failures.push('replacement editor dialog is missing the done action')
    }
    await page.screenshot({ path: `${screenshotDir}/10-binding-editor-1680.png` })
    await dismissErrorToasts()
    await doneButton.click()
    await page.waitForSelector('.app-dialog .map-load-editor', { state: 'detached', timeout: 10_000 })
    if ((await page.locator('.asset-library-browser').count()) !== 1) {
      failures.push('asset grid did not come back after closing the replacement editor dialog')
    }
    await page.waitForSelector('.asset-library-browser', { state: 'visible', timeout: 10_000 })
    const bindingRows = await page.locator('.asset-library-load-binding-row').count()
    if (bindingRows !== 1) failures.push(`expected the created replacement to stay in the left list, found ${bindingRows} rows`)
    const rowTarget = await page.locator('.asset-library-load-binding-target').first().textContent()
    if (rowTarget !== 'Portraits/Abigail') {
      failures.push(`configured replacement row should read its target, got "${rowTarget}"`)
    }
    await page.screenshot({ path: `${screenshotDir}/11-merged-layout-1680.png` })

    // 5.6. Flat replacement rows: no enabled/disabled badge, the delete button
    //      is invisible until row hover/focus, and a disabled row dims to 45%
    //      explaining itself through the row tooltip. The disabled state is
    //      seeded through the real product path: the advanced fold's enable
    //      toggle, with the footer exposing 已停用 + a working 启用 recovery.
    await page.locator('.asset-library-load-binding-row').first().click()
    await page.waitForSelector('.app-dialog .map-load-editor', { state: 'visible', timeout: 10_000 })
    if ((await page.locator('.app-dialog .app-dialog-title').textContent()) !== '替换图片 · Abigail') {
      failures.push(
        `reopened replacement dialog title should read 替换图片 · Abigail, got "${await page.locator('.app-dialog .app-dialog-title').textContent()}"`,
      )
    }
    await page.locator('.app-dialog .map-load-advanced-toggle').click()
    const enableSwitch = page.locator('.app-dialog .load-binding-switch')
    if ((await enableSwitch.count()) !== 1) {
      failures.push('advanced fold is missing the enable switch')
    }
    if ((await enableSwitch.getAttribute('aria-checked')) !== 'true') {
      failures.push('enable switch should start checked for a fresh enabled replacement')
    }
    await enableSwitch.click()
    await page.waitForFunction(() => document.querySelector('.app-dialog .asset-library-binding-status')?.textContent === '已停用', null, {
      timeout: 5_000,
    })
    const enableAction = page.locator('.app-dialog').getByRole('button', { name: '启用', exact: true })
    if ((await enableAction.count()) !== 1) failures.push('disabled replacement footer is missing the 启用 recovery action')
    await enableAction.click()
    await page.waitForFunction(() => document.querySelector('.app-dialog .asset-library-binding-status')?.textContent === '已生效', null, {
      timeout: 5_000,
    })
    // Seed the disabled row state for the assertions below, then close.
    if ((await enableSwitch.getAttribute('aria-checked')) !== 'true') {
      failures.push('enable switch should read checked again after the 启用 recovery action')
    }
    await enableSwitch.click()
    await page.waitForFunction(() => document.querySelector('.app-dialog .asset-library-binding-status')?.textContent === '已停用', null, {
      timeout: 5_000,
    })
    await page.screenshot({ path: `${screenshotDir}/12-disabled-row-1680.png` })
    await dismissErrorToasts()
    await page.locator('.app-dialog').getByRole('button', { name: '完成', exact: true }).click()
    await page.waitForSelector('.app-dialog .map-load-editor', { state: 'detached', timeout: 10_000 })
    // Focus stays on the reopened row button after the dialog closes; blur it
    // so :focus-within stops holding the delete button visible.
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
    const firstRow = page.locator('.asset-library-load-binding-row').first()
    const rowInfo = await firstRow.evaluate((row) => {
      const main = row.querySelector('.asset-library-load-binding-main')
      const del = row.querySelector('.icon-button')
      return {
        badge: Boolean(row.querySelector('.asset-editor-badge')),
        mainOpacity: main ? getComputedStyle(main).opacity : null,
        deleteOpacity: del ? getComputedStyle(del).opacity : null,
        mainBorder: main ? getComputedStyle(main).borderTopWidth : null,
        title: main?.getAttribute('title') ?? null,
      }
    })
    if (rowInfo.badge) failures.push('replacement row still renders the enabled/disabled state badge')
    if (rowInfo.deleteOpacity !== '0') failures.push(`row delete button should be invisible by default, opacity ${rowInfo.deleteOpacity}`)
    if (rowInfo.mainBorder !== '0px') failures.push(`flat replacement row kept a border (${rowInfo.mainBorder})`)
    if (rowInfo.mainOpacity !== '0.45') failures.push(`disabled replacement row opacity is ${rowInfo.mainOpacity}, expected 0.45`)
    if (rowInfo.title !== '已停用') failures.push(`disabled replacement row tooltip reads "${rowInfo.title}", expected 已停用`)
    await firstRow.hover()
    await page.waitForTimeout(250)
    const deleteOpacityHover = await firstRow.locator('.icon-button').evaluate((node) => getComputedStyle(node).opacity)
    if (deleteOpacityHover !== '1') failures.push(`row delete button did not appear on row hover, opacity ${deleteOpacityHover}`)
    await page.mouse.move(0, 0)
    // The delete button fades out through a transition; wait for it to settle
    // instead of racing a fixed delay.
    await page.waitForFunction(
      () => {
        const row = document.querySelector('.asset-library-load-binding-row')
        const del = row?.querySelector('.icon-button')
        return del ? getComputedStyle(del).opacity === '0' : false
      },
      null,
      { timeout: 5000 },
    )
    const deleteOpacityIdle = await firstRow.locator('.icon-button').evaluate((node) => getComputedStyle(node).opacity)
    if (deleteOpacityIdle !== '0') failures.push(`row delete button did not hide after hover, opacity ${deleteOpacityIdle}`)

    // 6. Header carries no action buttons; imports collapse into one split
    //    button (primary + chevron) in the toolbar.
    if ((await page.locator('.asset-library-header button').count()) !== 0) {
      failures.push('asset library header still renders action buttons')
    }
    if ((await page.locator('.asset-library-import-split').count()) !== 1) {
      failures.push('toolbar is missing the import split button')
    }
    const toolbarPrimaries = await page.locator('.asset-library-toolbar .control-button-primary').count()
    if (toolbarPrimaries !== 2) {
      failures.push(`expected the import split button pair in the toolbar, found ${toolbarPrimaries} primary buttons`)
    }
    for (const label of ['从游戏复制', '新建地图', '导入文件夹']) {
      const standalone = await page.locator('.asset-library-toolbar').getByRole('button', { name: label, exact: true }).count()
      if (standalone !== 0) failures.push(`toolbar still shows a standalone ${label} button`)
    }

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
    //    actions stacked as a full-width flat column, destructive action
    //    rendered as a real danger-tinted button.
    await page.locator('.asset-library-asset', { hasText: 'portrait_abel.png' }).first().click()
    await page.waitForSelector('.asset-library-preview img', { state: 'visible', timeout: 15_000 })
    const inspector = await page.evaluate(() => {
      const preview = document.querySelector('.asset-library-preview')
      const previewStyle = preview ? getComputedStyle(preview) : null
      const danger = document.querySelector('.asset-library-actions .control-button.is-danger')
      const dangerStyle = danger ? getComputedStyle(danger) : null
      const actionBoxes = [...document.querySelectorAll('.asset-library-actions .control-button')].map((node) =>
        node.getBoundingClientRect(),
      )
      return {
        previewBorderWidth: previewStyle?.borderTopWidth ?? '',
        previewBackground: previewStyle?.backgroundColor ?? '',
        dependencySections: document.querySelectorAll('.asset-library-dependencies').length,
        emptyDependencyCopy: document.querySelectorAll('.asset-library-dependencies-empty').length,
        dangerBorderColor: dangerStyle?.borderTopColor ?? '',
        dangerBackground: dangerStyle?.backgroundColor ?? '',
        actionCount: actionBoxes.length,
        actionsSameLeft: actionBoxes.every((box) => Math.abs(box.left - actionBoxes[0].left) < 1),
        actionsSameRight: actionBoxes.every((box) => Math.abs(box.right - actionBoxes[0].right) < 1),
        actionsStacked: actionBoxes.every((box, index) => index === 0 || box.top >= actionBoxes[index - 1].bottom - 1),
      }
    })
    if (inspector.previewBorderWidth !== '0px') failures.push(`detail preview kept a border (${inspector.previewBorderWidth})`)
    if (inspector.previewBackground !== 'rgba(0, 0, 0, 0)' && inspector.previewBackground !== 'transparent') {
      failures.push(`detail preview kept a background (${inspector.previewBackground})`)
    }
    if (inspector.dependencySections !== 0) failures.push('empty dependency sections should be hidden, not rendered')
    if (inspector.emptyDependencyCopy !== 0) failures.push('empty dependency copy leaked back into the inspector')
    if (inspector.actionCount < 4) failures.push(`expected at least 4 inspector action buttons, found ${inspector.actionCount}`)
    if (!inspector.actionsSameLeft || !inspector.actionsSameRight || !inspector.actionsStacked) {
      failures.push('inspector action buttons are not laid out as a full-width flat column')
    }
    const isTransparent = (value) => value === 'rgba(0, 0, 0, 0)' || value === 'transparent'
    if (isTransparent(inspector.dangerBorderColor)) failures.push('delete action lost its button border')
    if (isTransparent(inspector.dangerBackground)) failures.push('delete action lost its button background')
    await page.screenshot({ path: `${screenshotDir}/03-inspector-1680.png` })

    // 9. List view keeps thumbnails and single-line rows; grouping stays
    //    grid-only, so no kind headers are rendered here.
    await page.locator('.asset-library-view-switch button[aria-pressed="false"]').first().click()
    await page.waitForTimeout(400)
    const listThumbnails = await page.locator('.asset-library-assets.is-list .asset-image-thumbnail img').count()
    if (listThumbnails !== 3) failures.push(`list view lost image thumbnails (found ${listThumbnails})`)
    const listHeaders = await page.locator('.asset-library-kind-header').count()
    if (listHeaders !== 0) failures.push(`list view should not render kind headers (found ${listHeaders})`)
    await page.screenshot({ path: `${screenshotDir}/04-list-1680.png` })
    await page.locator('.asset-library-view-switch button[aria-pressed="false"]').first().click()
    await page.waitForTimeout(300)

    // 9.1. Box-select two map cards with a real drag (slice 3): the batch bar
    //      appears with the right count, and batch delete removes exactly those
    //      cards through the shared Dialog.
    await page.waitForSelector('.asset-library-kind-header', { state: 'visible', timeout: 10_000 })
    const mapCardLocator = page.locator(
      '.asset-library-asset[data-asset-path="assets/maps/Festival.tbin"], .asset-library-asset[data-asset-path="assets/maps/Mountain.tmx"]',
    )
    if ((await mapCardLocator.count()) !== 2) {
      failures.push('expected two seeded map cards before box select')
    } else {
      const firstBox = await mapCardLocator.first().boundingBox()
      const secondBox = await mapCardLocator.nth(1).boundingBox()
      if (!firstBox || !secondBox) {
        failures.push('map cards have no bounding box for box select')
      } else {
        await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y - 20)
        await page.mouse.down()
        await page.mouse.move(secondBox.x + secondBox.width - 6, secondBox.y + secondBox.height - 6, { steps: 12 })
        await page.mouse.up()
        await page.waitForSelector('.asset-library-selection-pill', { state: 'visible', timeout: 5_000 })
        const selectionText = (await page.locator('.asset-library-selection-count').textContent()) ?? ''
        if (!selectionText.includes('2')) failures.push(`batch bar selection count mismatch: "${selectionText}"`)
        const multiSelected = await page.locator('.asset-library-asset.is-multi-selected').count()
        if (multiSelected !== 2) failures.push(`box select marked ${multiSelected} cards, expected 2`)
        await page.screenshot({ path: `${screenshotDir}/07-box-select-1680.png` })

        await page.getByRole('button', { name: '删除选中' }).click()
        await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 5_000 })
        const dialogTitle = (await page.locator('.app-dialog .app-dialog-title').textContent()) ?? ''
        if (!dialogTitle.includes('删除选中')) failures.push(`batch delete dialog title mismatch: "${dialogTitle}"`)
        await page.locator('.app-dialog').getByRole('button', { name: '删除', exact: true }).click()
        await page.waitForFunction((total) => document.querySelectorAll('.asset-library-asset').length === total, 5, { timeout: 15_000 })
        if ((await page.locator('.asset-library-selection-pill').count()) !== 0) {
          failures.push('batch bar survived a successful batch delete')
        }
        if ((await page.locator('.asset-library-asset[data-asset-path="assets/maps/Mountain.tmx"]').count()) !== 0) {
          failures.push('box-selected map asset survived the batch delete')
        }
        await page.screenshot({ path: `${screenshotDir}/08-after-batch-delete-1680.png` })
      }
    }

    // 9.2. Copy-from-game imports four asset kinds (map/image/audio/data)
    //      through the real segmented entries and pickers; each imported asset
    //      must land in the correct grid group and no error toast may appear.
    const errorsBeforeImports = await page.locator('.notification-toast.level-error').count()
    await importFromGameKind('地图', 'assets/maps/Town.tmx', 'map', '地图')
    await importFromGameKind('图片', 'assets/Abigail.png', 'image', '图片')
    await importFromGameKind('音频', 'assets/cowboy_kidnapping.wav', 'audio', '音频')
    await importFromGameKind('数据', 'assets/ObjectInformation.json', 'data', '数据')
    await page.waitForFunction((total) => document.querySelectorAll('.asset-library-asset').length === total, 9, { timeout: 15_000 })
    const errorsAfterImports = await page.locator('.notification-toast.level-error').count()
    if (errorsAfterImports > errorsBeforeImports) {
      failures.push(`game asset imports surfaced ${errorsAfterImports - errorsBeforeImports} error notification(s)`)
    }
    await page.screenshot({ path: `${screenshotDir}/09-after-game-imports-1680.png` })

    // 9.3. Batch 1 mount API inside the asset library: "编辑地图" opens the map
    //      editor in place (lazy host) without switching modules, and the
    //      editor's return button restores the grid with the card still
    //      selected.
    await page.locator('[data-asset-path="assets/maps/Seed.tmx"] .asset-library-asset-main').first().click()
    await page.getByRole('button', { name: '编辑地图', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    if ((await page.locator('.map-asset-viewport').count()) !== 1) {
      failures.push('embedded map editor did not mount its viewport/canvas')
    }
    if ((await page.locator('.workbench-side-nav-item[data-tip="素材库"][aria-current="page"]').count()) !== 1) {
      failures.push('asset library side navigation de-activated while its embedded map editor is open')
    }
    if ((await page.locator('.workbench-side-nav-item[data-tip="地图制作"][aria-current="page"]').count()) !== 0) {
      failures.push('embedded map editor switched the module to 地图制作')
    }
    await page.screenshot({ path: `${screenshotDir}/12-map-editor-embedded-1680.png` })
    await page.getByRole('button', { name: '返回地图库', exact: true }).first().click()
    await page.waitForSelector('.map-asset-editor', { state: 'detached', timeout: 10_000 })
    await page.waitForSelector('.asset-library-browser', { state: 'visible', timeout: 10_000 })
    if ((await page.locator('.asset-library-asset[data-asset-path="assets/maps/Seed.tmx"].is-selected').count()) !== 1) {
      failures.push('asset library grid lost the selected card after returning from the embedded map editor')
    }
    await page.screenshot({ path: `${screenshotDir}/13-after-map-editor-return-1680.png` })

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
