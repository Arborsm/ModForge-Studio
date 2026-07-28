import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the workbench authoring workspaces.
 *
 * Creates a project through the real product path, then walks the
 * content-oriented authoring flow: singleton data workspaces land straight in
 * their structured editor (the patch is ensured automatically, no patch
 * picking), the expert patch list lives only in project-content, and the raw
 * escape hatch is reachable from there. Covers the three-pane editor (source
 * rail, schema canvas, preview + validation rail), an appearance variant
 * edited through the nested-list control, the gift-taste section that stages
 * into its own patch, the building footprint grid and its in-preview tile
 * picker. Runs light and dark at 1680 and 1440. Screenshots land in the
 * system temp dir unless overridden via MODFORGE_AUTHORING_SCREENSHOT_DIR.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_AUTHORING_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-workbench-authoring')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate))

async function main() {
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  const failures = []
  /** Checks this environment could not exercise; always reported, never silent. */
  const skipped = []
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

  async function waitOverlayGone() {
    await page.waitForFunction(() => document.querySelectorAll('.app-dialog-overlay').length === 0, null, { timeout: 15_000 })
  }

  /** Opens a schema group by its localized summary label. */
  async function openFieldGroup(label) {
    const summary = page.locator('.asset-entry-group-summary', { hasText: label }).first()
    await summary.scrollIntoViewIfNeeded()
    const open = await summary.evaluate((node) => node.closest('details')?.open === true)
    if (!open) {
      await summary.click()
      await page.waitForTimeout(300)
    }
  }

  try {
    let opened = null
    for (const url of process.env.MODFORGE_AUTHORING_URL ? [process.env.MODFORGE_AUTHORING_URL] : fallbackUrls) {
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

    // 1. Create a project so the authoring workspaces have a draft to write into.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Authoring Verify')
    await projectFields.nth(1).fill('Arbor.AuthoringVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    // 2. The character workspace is content-oriented: it lands straight in the
    //    singleton Data/Characters editor, its patch ensured automatically.
    await page.getByRole('button', { name: '角色制作' }).first().click()
    await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    if ((await page.locator('.workspace-patch-list').count()) !== 0) {
      failures.push('character workspace rendered a patch list; the singleton editor should open directly')
    }
    await page.screenshot({ path: `${screenshotDir}/01-character-editor-direct.png` })

    // 3. Data/Characters is already open; creating an entry needs a home placement.
    await page.getByRole('button', { name: '新增角色' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const addDialog = page.locator('.app-dialog')
    const addInputs = addDialog.locator('input')
    await addInputs.nth(0).fill('{{ModId}}_Aspen')
    await addDialog.getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForTimeout(400)
    if ((await addDialog.locator('.asset-field-error').count()) === 0) {
      failures.push('add dialog accepted a character without a home location')
    }
    await addInputs.nth(1).fill('Town')
    await addInputs.nth(2).fill('29')
    await addInputs.nth(3).fill('67')
    await addDialog.getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(1000)

    const editorText = await page.locator('.asset-editor').innerText()
    if (!editorText.includes('{{ModId}}_Aspen')) failures.push('character entry did not appear after staging a new entry')
    if (!editorText.includes('核心档案')) failures.push('character entry form did not render its field groups')
    if (!editorText.includes('礼物喜好')) failures.push('gift taste section missing from the character editor')
    for (const pane of ['.asset-source-pane', '.asset-editor-scroll', '.asset-preview-pane']) {
      if ((await page.locator(pane).count()) !== 1) failures.push(`three-pane layout is missing ${pane}`)
    }
    if ((await page.locator('.asset-validation-rail').count()) === 0) failures.push('validation rail missing from the preview pane')
    await page.screenshot({ path: `${screenshotDir}/02-character-editor-three-pane.png` })

    // 4. The vanilla roster is listed alongside the project group in the source rail.
    const sourceGroups = await page.locator('.asset-source-group').count()
    if (sourceGroups === 0) failures.push('source rail rendered no groups')
    if (!(await page.locator('.asset-source-pane').innerText()).includes('项目已覆盖')) {
      failures.push('source rail is missing the project group heading')
    }

    // 5. Appearance variants are edited as a structured nested list, not raw JSON.
    await openFieldGroup('绘制、动画与头像')
    const appearanceGroup = page.locator('.asset-field', { has: page.locator('.asset-field-label', { hasText: '外观变体' }) }).first()
    await appearanceGroup.scrollIntoViewIfNeeded()
    await appearanceGroup.locator('.asset-field-add-row').first().click()
    await page.waitForTimeout(400)
    const variantItem = appearanceGroup.locator('.asset-field-nested-item').first()
    if ((await variantItem.count()) === 0) {
      failures.push('appearance nested-list did not add a variant row')
    } else {
      const variantText = await variantItem.innerText()
      for (const label of ['变体 ID', '启用条件', '季节']) {
        if (!variantText.includes(label)) failures.push(`appearance variant row is missing the "${label}" control`)
      }
      await variantItem.locator('input[type="text"]').first().fill('Winter')
      await variantItem.locator('input[type="text"]').first().blur()
      await page.waitForTimeout(500)
      await variantItem.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${screenshotDir}/03-appearance-variant.png` })
    }

    // 6. The portrait/sprite cards offer an editor jump that ensures the
    //    matching EditImage patch itself.
    const assetCardButtons = page.locator('.asset-editor-asset-card button', { hasText: '编辑图像' })
    if ((await assetCardButtons.count()) !== 2) {
      failures.push(`expected 2 asset-card editor buttons, found ${await assetCardButtons.count()}`)
    } else {
      await assetCardButtons.first().click()
      await page.waitForTimeout(1200)
      const jumpText = await page.locator('body').innerText()
      if (!jumpText.includes('Portraits/{{ModId}}_Aspen') || !jumpText.includes('EditImage')) {
        failures.push('the asset-card jump did not open the image editor for the ensured portrait patch')
      }
      await page.screenshot({ path: `${screenshotDir}/04-portrait-editimage.png` })
      await page.getByRole('button', { name: '后退' }).first().click()
      await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 15_000 })
    }

    // 7. Dark theme and the narrow desktop width keep the three-pane editor readable.
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${screenshotDir}/05-character-editor-dark.png` })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${screenshotDir}/06-character-editor-dark-1440.png` })

    // 8. The expert patch list only exists in project-content; the raw escape
    //    hatch for an unsupported asset is reached from there.
    await page.setViewportSize({ width: 1680, height: 1000 })
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.locator('.workbench-side-nav-item', { hasText: '项目内容' }).first().click()
    await page.waitForSelector('.workspace-patch-list', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    await page.locator('.workspace-patch-list').getByRole('button', { name: '新增 Patch' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const addPatchDialog = page.locator('.app-dialog')
    await addPatchDialog.getByText('编辑数据', { exact: true }).first().click()
    await page.waitForTimeout(400)
    const customTarget = addPatchDialog.locator('input').last()
    await customTarget.fill('Data/NPCGiftTastes')
    await addPatchDialog.getByRole('button', { name: '新增 Patch', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(600)
    await page.locator('.workspace-patch-row-open').first().click()
    await page.waitForTimeout(1000)
    const rawText = await page.locator('body').innerText()
    if (!rawText.includes('该资产还没有结构化编辑器')) failures.push('unsupported asset notice missing on the raw fallback editor')
    if (rawText.includes('原始 JSON\n直接编辑')) failures.push('raw JSON editor should stay closed until the author opens it')
    await page
      .getByRole('button', { name: /编辑原始 JSON/ })
      .first()
      .click()
    await page.waitForTimeout(500)
    if ((await page.locator('textarea').count()) === 0) failures.push('raw JSON escape hatch did not open a textarea')
    await page.screenshot({ path: `${screenshotDir}/07-raw-escape-hatch.png` })

    // 9. The codex is a separate module; it renders search, list and preview only
    //    and never opens a draft of its own.
    await page.locator('.workbench-side-nav-item', { hasText: '角色图鉴' }).first().click()
    await page.waitForTimeout(1500)
    await skipGuides()
    if ((await page.locator('.workspace-patch-list').count()) !== 0) {
      failures.push('character codex rendered the authoring patch list; the browser page must not open a draft')
    }
    await page.screenshot({ path: `${screenshotDir}/08-character-codex.png` })

    // 10. The building page is also content-oriented: straight into the
    //     Data/Buildings editor, footprint grid over the assembled sprite.
    await page.locator('.workbench-side-nav-item', { hasText: '建筑制作' }).first().click()
    await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 20_000 })
    await skipGuides()
    if ((await page.locator('.workspace-patch-list').count()) !== 0) {
      failures.push('building workspace rendered a patch list; the singleton editor should open directly')
    }

    await page.getByRole('button', { name: '新建建筑' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const buildingDialog = page.locator('.app-dialog')
    const buildingInputs = buildingDialog.locator('input')
    await buildingInputs.nth(0).fill('{{ModId}}_Aviary')
    await buildingInputs.nth(1).fill('0')
    await buildingDialog.getByRole('button', { name: '创建', exact: true }).click()
    await page.waitForTimeout(400)
    if ((await buildingDialog.locator('.asset-field-error').count()) === 0) {
      failures.push('add building dialog accepted a footprint the game cannot place')
    }
    await buildingInputs.nth(1).fill('4')
    await buildingInputs.nth(2).fill('3')
    await buildingDialog.getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(1000)

    const buildingEditorText = await page.locator('.asset-editor').innerText()
    if (!buildingEditorText.includes('{{ModId}}_Aviary')) failures.push('building entry did not appear after staging a new entry')
    for (const label of ['基础信息', '建造', '放置与占地']) {
      if (!buildingEditorText.includes(label)) failures.push(`building entry form is missing the "${label}" field group`)
    }
    for (const pane of ['.asset-source-pane', '.asset-editor-scroll', '.asset-preview-pane']) {
      if ((await page.locator(pane).count()) !== 1) failures.push(`building three-pane layout is missing ${pane}`)
    }
    if ((await page.locator('.asset-validation-rail').count()) === 0)
      failures.push('validation rail missing from the building preview pane')
    if ((await page.locator('.building-preview-stage').count()) === 0) failures.push('building preview stage did not render')

    // The footprint grid is the create dialog's size, drawn cell by cell.
    const footprintCells = await page.locator('.building-footprint-cell').count()
    if (footprintCells !== 12) failures.push(`expected a 4x3 footprint grid, found ${footprintCells} cells`)
    await page.screenshot({ path: `${screenshotDir}/09-building-editor-three-pane.png` })

    // 11. Picking the human door on the grid writes the tile into the entry.
    await page.getByRole('button', { name: '人物门', exact: true }).first().click()
    await page.waitForTimeout(300)
    const pickTile = page.getByRole('button', { name: '地块 1, 2', exact: true })
    if ((await pickTile.count()) === 0) {
      failures.push('footprint tiles are not pickable while a pick target is active')
    } else {
      await pickTile.first().click()
      await page.waitForTimeout(600)
      await openFieldGroup('放置与占地')
      const humanDoorField = page.locator('.asset-field', { has: page.locator('.asset-field-label', { hasText: '人物门' }) }).first()
      await humanDoorField.scrollIntoViewIfNeeded()
      const axes = humanDoorField.locator('input[type="number"]')
      const picked = [await axes.nth(0).inputValue(), await axes.nth(1).inputValue()]
      if (picked.join(',') !== '1,2') failures.push(`picking a tile wrote ${picked.join(',')} into HumanDoor instead of 1,2`)
      await page.screenshot({ path: `${screenshotDir}/10-building-footprint-pick.png` })
    }

    // 12. The building codex stays read-only and offers the jump into authoring.
    //     Its rows come from the game directory, so the checks below only run
    //     when this environment actually indexed one.
    await page
      .locator('.workbench-side-nav-item', { hasText: /^建筑$/ })
      .first()
      .click()
    await page.waitForTimeout(1500)
    await skipGuides()
    if ((await page.locator('.workspace-patch-list').count()) !== 0) {
      failures.push('building codex rendered the authoring patch list; the browser page must not open a draft')
    }
    await page.screenshot({ path: `${screenshotDir}/11-building-codex.png` })
    const codexRows = await page.locator('.building-workspace-browser-row').count()
    if (codexRows === 0) {
      skipped.push('building codex read-only render and authoring jump (no game directory indexed in this environment)')
    } else {
      await page.locator('.building-workspace-browser-row-main').first().click()
      await page.waitForTimeout(1200)
      if ((await page.locator('.asset-entry-group').count()) === 0) {
        failures.push('building codex details did not render the shared schema read-only')
      }
      if ((await page.locator('.asset-field input:not([disabled]), .asset-field textarea:not([disabled])').count()) !== 0) {
        failures.push('building codex rendered editable controls; the codex must stay read-only')
      }
      const jump = page.locator('.building-workspace-browser-row-jump')
      if ((await jump.count()) === 0) {
        failures.push('building codex rows do not offer the jump into building authoring')
      } else {
        await jump.first().click()
        await page.waitForTimeout(1500)
        if ((await page.locator('.asset-source-pane').count()) === 0) {
          failures.push('the codex jump did not open the building authoring editor')
        }
        await page.screenshot({ path: `${screenshotDir}/12-building-codex-jump.png` })
      }
    }
  } finally {
    await browser.close()
  }

  if (skipped.length > 0) {
    console.warn(`workbench authoring verification skipped:\n- ${skipped.join('\n- ')}`)
  }
  if (failures.length > 0) {
    console.error(`workbench authoring verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`workbench authoring verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
