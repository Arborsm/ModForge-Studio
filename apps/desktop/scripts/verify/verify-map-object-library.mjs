import { chromium } from 'playwright'

/**
 * End-to-end verification of the map editor's bottom object panel against REAL
 * game data. Requires:
 *   - `vp run web:dev` (web dev server);
 *   - the dev asset bridge (`cargo run --features dev-asset-bridge --example event_asset_bridge`);
 *   - SDV_GAME_PATH pointing at an installed Stardew Valley.
 * It opens the page-performance map-asset-editor scenario with `mfGameRoot`
 * and the asset bridge enabled, then checks: the bottom panel opens from the
 * toolbar, object tab renders categorized objects with fixed-scale (24px/tile)
 * thumbnails, category chips filter, favorites star + favorites category work,
 * picking an object attaches its sheet and arms the stamp, and the sheet tab
 * shows the docked whole-image palette. Screenshots land in MAP_OBJECT_SHOTS
 * (default /tmp/map-object-shots).
 */

const gameRoot = process.env.SDV_GAME_PATH ?? ''
const baseUrl = process.env.MODFORGE_OBJECT_LIB_URL ?? 'http://127.0.0.1:5173/'
const targetUrl = `${baseUrl}?mfPagePerfScenario=map-asset-editor&mfEventEditorAssetBridge=1&mfGameRoot=${encodeURIComponent(gameRoot)}`
const shotsDir = process.env.MAP_OBJECT_SHOTS ?? '/tmp/map-object-shots'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined

import { mkdirSync } from 'node:fs'

async function main() {
  if (!gameRoot) {
    console.error('SDV_GAME_PATH is required')
    process.exit(2)
  }
  mkdirSync(shotsDir, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto(targetUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('.map-asset-editor', { timeout: 30_000 })

  // 1) Open the bottom object panel from the toolbar and wait for derived rows.
  await page.getByRole('button', { name: 'Open asset tray' }).click()
  await page.waitForSelector('.map-object-panel .map-object-library-object-pick', { timeout: 30_000 })
  await page.waitForTimeout(600)
  const objectCount = await page.locator('.map-object-library-object-pick').count()
  const virtualHeight = await page
    .locator('.map-object-library-virtual')
    .evaluate((element) => Number.parseFloat(element.style.height) || 0)
  const panelBox = await page.locator('.map-object-panel').boundingBox()
  await page.screenshot({ path: `${shotsDir}/object-library.png` })

  // 2) Category chip filters: seating only.
  await page.getByRole('tab', { name: 'Seating' }).click()
  await page.waitForTimeout(300)
  const seatingCount = await page.locator('.map-object-library-object-pick').count()
  await page.screenshot({ path: `${shotsDir}/object-category-seating.png` })
  await page.getByRole('tab', { name: 'All categories' }).click()
  await page.waitForTimeout(200)

  // 3) Fixed-scale thumbnails (1 tile = 24px): Oak Chair 1×2 → 24×48；Patchwork Rug 3×2 → 72×48。
  await page.locator('.map-object-library-search input').fill('Oak Chair')
  await page.waitForTimeout(300)
  const chairBox = await page.locator('.map-object-library-object-thumb').first().boundingBox()
  await page.screenshot({ path: `${shotsDir}/object-search-chair.png` })
  await page.locator('.map-object-library-search input').fill('Patchwork Rug')
  await page.waitForTimeout(300)
  const rugBox = await page.locator('.map-object-library-object-thumb').first().boundingBox()

  // 4) Favorite the rug, open the favorites category, verify it is listed.
  await page.locator('.map-object-library-object-fav').first().click()
  await page.getByRole('tab', { name: 'Favorites' }).click()
  await page.waitForTimeout(300)
  const favoritesCount = await page.locator('.map-object-library-object-pick').count()
  const favoriteName = await page.locator('.map-object-library-object-pick').first().textContent()
  await page.screenshot({ path: `${shotsDir}/object-favorites.png` })

  // 5) Pick the rug from favorites: its sheet attaches and the stamp arms.
  await page.locator('.map-object-library-object-pick').first().click()
  await page.waitForTimeout(400)
  const statusBrush = await page.locator('.map-asset-statusbar').textContent()
  await page.screenshot({ path: `${shotsDir}/object-picked.png` })

  // 6) The sheet tab hosts the docked whole-image palette with the new sheet.
  await page.getByRole('tab', { name: 'Sheet' }).click()
  await page.waitForSelector('.map-tileset-palette', { timeout: 10_000 })
  await page.waitForTimeout(800)
  const sheetTrigger = await page.locator('.map-tileset-palette .map-tilesheet-picker-trigger-label').textContent()
  await page.screenshot({ path: `${shotsDir}/sheet-tab.png` })

  await browser.close()

  const result = {
    objectCount,
    virtualHeight,
    panelBox,
    seatingCount,
    chairBox,
    rugBox,
    favoritesCount,
    favoriteName,
    statusBrush: statusBrush?.trim(),
    sheetTrigger,
    consoleErrors,
  }
  console.log(JSON.stringify(result, null, 2))

  const failures = []
  if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join('; ')}`)
  if (virtualHeight < 5000) failures.push(`expected virtual height 5000+ for the full catalog, got ${virtualHeight}`)
  if (!panelBox || panelBox.width < 400 || panelBox.height < 150) failures.push(`panel box suspicious: ${JSON.stringify(panelBox)}`)
  if (seatingCount < 5) failures.push(`seating category rendered only ${seatingCount} rows`)
  if (!chairBox || !rugBox) failures.push('thumbnail boxes missing')
  else {
    const chairOk = Math.round(chairBox.width) === 24 && Math.round(chairBox.height) === 48
    const rugOk = Math.round(rugBox.width) === 72 && Math.round(rugBox.height) === 48
    if (!chairOk || !rugOk) failures.push(`fixed-scale thumbs wrong: chair=${JSON.stringify(chairBox)} rug=${JSON.stringify(rugBox)}`)
  }
  if (favoritesCount !== 1) failures.push(`favorites category should list exactly 1 object, got ${favoritesCount}`)
  if (!favoriteName?.includes('Patchwork Rug')) failures.push(`favorite object name wrong: ${favoriteName}`)
  if (!sheetTrigger || sheetTrigger.trim() === '') failures.push('sheet trigger empty after pick')
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`)
    process.exitCode = 1
  }
}

await main()
