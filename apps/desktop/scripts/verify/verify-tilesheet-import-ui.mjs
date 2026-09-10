import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/** Visual verification for the tilesheet importer through the browser dev mock. */
const baseUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_TILESHEET_IMPORT_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-tilesheet-import-ui')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
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
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y)
      const offset = y * (1 + width * 3) + 1 + x * 3
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}
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
  const gids = Array.from({ length: width * height }, (_, index) => (index % 16) + 1)
  const layer = {
    id: 1,
    name: 'Back',
    kind: 'tile',
    width,
    height,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids,
    nonEmptyTiles: gids.length,
  }
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
    tilesets: [
      {
        firstGid: 1,
        name: 'base',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 16,
        columns: 4,
        source: null,
        imageSource: null,
        imagePath: `data:image/png;base64,${tilesheetPngBase64(0)}`,
        imageWidth: 64,
        imageHeight: 64,
        properties: {},
        tileProperties: {},
        animations: {},
      },
    ],
    layers: [layer],
    objectGroups: [],
  }
}

async function main() {
  mkdirSync(screenshotDir, { recursive: true })
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const failures = []
  page.on('pageerror', (error) => failures.push(`uncaught page error: ${error.message}`))
  async function skipGuides() {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await page.locator('.guide-tour-backdrop').count()) === 0) return
      const skip = page.locator('.guide-tour-btn-ghost', { hasText: /跳过|Skip/ })
      if ((await skip.count()) === 0) return
      await skip.first().click()
      await page.waitForTimeout(350)
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
  async function expect(condition, message) {
    if (!condition) failures.push(message)
  }

  try {
    let opened = null
    for (const url of baseUrls) {
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
    await clickRobust(page.getByRole('button', { name: '新建项目' }).first())
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const fields = page.locator('.app-dialog input')
    await fields.nth(0).fill('Tilesheet Import UI Verify')
    await fields.nth(1).fill('Arbor.TilesheetImportUiVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
    await skipGuides()

    const imageAssets = [
      ['assets/tilesheets/meadow.png', 20, 64, 64],
      ['assets/tilesheets/stone.png', 90, 32, 48],
      ['assets/tilesheets/water.png', 150, 64, 32],
      ['assets/tilesheets/flowers.png', 210, 32, 64],
    ]
    const seedDocument = buildSeedDocument()
    await page.evaluate(
      async ({ document, imageAssets }) => {
        const drafts = await window.__TAURI_INTERNALS__.invoke('list_cp_maker_drafts')
        const draftStorageKey = drafts[0]?.draftStorageKey
        const assets = [
          {
            relativePath: 'assets/maps/Untitled.tmx',
            mediaType: 'application/json',
            bytesBase64: btoa(unescape(encodeURIComponent(JSON.stringify(document)))),
          },
        ]
        for (const [relativePath, , , , bytesBase64] of imageAssets) {
          assets.push({ relativePath, mediaType: 'image/png', bytesBase64 })
        }
        await window.__TAURI_INTERNALS__.invoke('write_cp_maker_project_assets', { request: { draftStorageKey, assets } })
      },
      {
        document: seedDocument,
        imageAssets: imageAssets.map(([relativePath, hue, width, height]) => [relativePath, hue, width, height, tilesheetPngBase64(hue)]),
      },
    )
    await page.locator('.top-menu-project-title').first().click()
    await page.locator('.top-menu-project-menu-item', { hasText: 'Tilesheet Import UI Verify' }).first().click()
    await page.waitForTimeout(1_000)
    await skipGuides()

    await page.locator('.workbench-side-nav-item[data-tip="素材库"]').first().click()
    await page.waitForSelector('.asset-library-toolbar', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('[data-asset-path="assets/maps/Untitled.tmx"] .asset-library-asset-main').first().click()
    await clickRobust(page.getByRole('button', { name: '地图编辑器', exact: true }).first())
    await page.waitForSelector('.map-asset-editor', { state: 'visible', timeout: 20_000 })
    await skipGuides()

    await page.locator('.map-tileset-palette-tab-add').click()
    await page.waitForSelector('.map-tilesheet-gallery-import', { state: 'visible', timeout: 10_000 })
    await expect((await page.locator('.map-tilesheet-gallery-import').innerText()) === '导入图块表', '画廊入口卡文案或元素缺失')
    await expect(
      (await page.locator('.map-tilesheet-gallery-group').allTextContents()).every(
        (text) => !text.includes('项目素材') && !text.includes('项目图片'),
      ),
      '旧项目图片分组仍然出现',
    )
    await page.screenshot({ path: path.join(screenshotDir, '01-gallery-light.png') })

    await page.locator('.map-tilesheet-gallery-import').click()
    await page.waitForSelector('.tilesheet-import-dialog', { state: 'visible', timeout: 10_000 })
    await expect(
      (await page.locator('.tilesheet-import-card').count()) === imageAssets.length,
      `导入卡片数量不符：${await page.locator('.tilesheet-import-card').count()}`,
    )
    await page.locator('.tilesheet-import-card img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await expect((await page.locator('.tilesheet-import-card img').count()) === imageAssets.length, '部分素材缩略图未加载为 img')
    await expect((await page.getByRole('button', { name: /从电脑导入/ }).count()) === 1, '从电脑导入按钮缺失')

    const cards = page.locator('.tilesheet-import-card')
    await cards.nth(0).click()
    await expect((await page.locator('.tilesheet-import-dialog').innerText()).includes('已选 1 张'), '单选计数不是 1')
    await cards.nth(1).click({ modifiers: ['Control'] })
    await expect((await page.locator('.tilesheet-import-dialog').innerText()).includes('已选 2 张'), 'Ctrl 多选计数不是 2')
    await expect((await page.getByRole('button', { name: /附着 2 张/ }).count()) === 1, '确认按钮未显示附着 2 张')

    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()
    if (first && second) {
      const grid = await page.locator('.tilesheet-import-grid').boundingBox()
      const startX = Math.min(first.x + first.width + 2, (grid?.x ?? first.x) + (grid?.width ?? first.width) - 2)
      const startY = first.y + first.height / 2
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(second.x + second.width + 12, second.y + second.height + 12, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(300)
      const selectedAfterBox = await page.locator('.tilesheet-import-card.is-selected').count()
      await expect(selectedAfterBox > 0, '空白处框选没有选中任何素材')
      if (selectedAfterBox !== 2) {
        await cards.nth(0).click()
        await cards.nth(1).click({ modifiers: ['Control'] })
      }
    } else {
      failures.push('无法测量导入卡片用于框选验证')
    }

    await page.getByRole('button', { name: /附着 \d+ 张$/ }).click()
    await page.waitForFunction(() => document.querySelector('.tilesheet-import-dialog') === null, null, { timeout: 20_000 })
    await page.waitForTimeout(800)
    const tabCount = await page.locator('.map-tileset-palette-tab').count()
    await expect(tabCount === 3, `附着后图块表 tab 数量应为 3，实际为 ${tabCount}`)
    await page.screenshot({ path: path.join(screenshotDir, '02-gallery-light-after-attach.png') })

    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(screenshotDir, '03-gallery-dark.png') })
    await page.locator('.map-tilesheet-gallery-import').click()
    await page.waitForSelector('.tilesheet-import-dialog', { state: 'visible', timeout: 10_000 })
    await page.screenshot({ path: path.join(screenshotDir, '03-dialog-dark.png') })

    const beforeImportCount = await page.locator('.tilesheet-import-card').count()
    const beforeTabs = await page.locator('.map-tileset-palette-tab').count()
    await page.getByRole('button', { name: /从电脑导入/ }).click()
    await page.waitForFunction((count) => document.querySelectorAll('.tilesheet-import-card').length === count + 2, beforeImportCount, {
      timeout: 10_000,
    })
    const importedCount = await page.locator('.tilesheet-import-card').count()
    await expect(importedCount === beforeImportCount + 2, `电脑导入后卡片数量应增加 2，实际增加 ${importedCount - beforeImportCount}`)
    await expect((await page.locator('.tilesheet-import-dialog').innerText()).includes('已选 2 张'), '电脑导入后新图片未自动选中')
    await page.getByRole('button', { name: /附着 \d+ 张$/ }).click()
    await page.waitForFunction(() => document.querySelector('.tilesheet-import-dialog') === null, null, { timeout: 20_000 })
    const tabsAfterDiskImport = await page.locator('.map-tileset-palette-tab').count()
    await expect(tabsAfterDiskImport === beforeTabs + 2, `电脑导入附着后 tab 应增加 2，实际增加 ${tabsAfterDiskImport - beforeTabs}`)

    await page.locator('.map-tilesheet-gallery-import').click()
    await page.waitForSelector('.tilesheet-import-dialog', { state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: /从电脑导入/ }).click()
    await page.getByText('没有新图片', { exact: false }).waitFor({ state: 'attached', timeout: 10_000 })
    await expect((await page.locator('.notification-viewport').innerText()).includes('没有新图片'), '重复导入未出现没有新图片通知')
    await page.screenshot({ path: path.join(screenshotDir, '04-dialog-light.png') })
  } finally {
    await browser.close()
  }
  if (failures.length > 0) {
    console.error(`tilesheet import UI verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`tilesheet import UI verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
