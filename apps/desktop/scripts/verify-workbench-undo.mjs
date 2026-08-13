import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Product-path check for the shared draft undo stack and the rebuilt add-patch
 * target picker.
 *
 * Walks what the convergence slice added: the add-patch dialog filtering the
 * 1.6 target catalog instead of a hand-kept list, the undo / redo buttons every
 * authoring toolbar now shows, one staged edit undoing as one operation, redo
 * putting it back, Ctrl+Z doing the same from the keyboard, and the mail and
 * dialogue pages reaching the same history from their own headers. Runs at 1680
 * and 1440.
 * Screenshots land in the system temp dir unless overridden via
 * MODFORGE_AUTHORING_SCREENSHOT_DIR.
 *
 * Prereq: a dev server on one of the candidate ports (`vp run dev`).
 */

const fallbackUrls = ['http://localhost:5173', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_AUTHORING_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-workbench-undo')
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

  async function openModule(label) {
    await waitOverlayGone()
    await page.locator('.workbench-side-nav-item', { hasText: label }).first().click()
    await page.waitForTimeout(1500)
    await skipGuides()
  }

  const undoButton = () => page.getByRole('button', { name: '撤销', exact: true }).first()
  const redoButton = () => page.getByRole('button', { name: '重做', exact: true }).first()

  /**
   * Keys the character rail lists for the project itself. The rail is pinned to
   * its "project" mode by the caller, so the vanilla roster stays out of the
   * count and every row here came from a staged edit.
   */
  async function projectEntries() {
    return page.locator('.asset-source-row-key').allInnerTexts()
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

    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Undo Verify')
    await projectFields.nth(1).fill('Arbor.UndoVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    // 1. The add-patch dialog offers the 1.6 catalog and narrows it as you type.
    await openModule('角色制作')
    await page.waitForSelector('.workspace-patch-list', { state: 'visible', timeout: 20_000 })
    await page.locator('.workspace-patch-list').getByRole('button', { name: '新增 Patch' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const patchDialog = page.locator('.app-dialog')
    await patchDialog.getByText('编辑数据', { exact: true }).first().click()
    await page.waitForTimeout(400)

    const targetList = patchDialog.locator('.max-h-64')
    const filterInput = patchDialog.locator('input[type="search"]').first()
    if ((await filterInput.count()) === 0) failures.push('the add-patch dialog has no target filter')
    const allTargets = await targetList.locator('button').allInnerTexts()
    // The catalog comes from the 1.6 asset registry filtered to the workspace's
    // own asset families, so it is neither empty nor the whole game.
    for (const expected of ['Data/Characters', 'Data/FarmAnimals', 'Data/NPCGiftTastes']) {
      if (!allTargets.includes(expected)) failures.push(`the character catalog is missing ${expected}`)
    }
    const strays = allTargets.filter(
      (target) => /^Characters\/(Dialogue|schedules)\//i.test(target) || /^(Data\/mail|Data\/Objects|Maps\/)/i.test(target),
    )
    if (strays.length > 0) failures.push(`the character catalog offers other workspaces' assets: ${strays.join(' / ')}`)
    await filterInput.fill('pet')
    await page.waitForTimeout(300)
    const filtered = await targetList.locator('button').allInnerTexts()
    if (filtered.length === 0) failures.push('filtering the catalog by "pet" matched nothing')
    if (filtered.some((target) => !target.toLowerCase().includes('pet'))) {
      failures.push(`the filter kept unrelated targets: ${filtered.join(' / ')}`)
    }
    await page.screenshot({ path: `${screenshotDir}/01-add-patch-filter.png` })

    await filterInput.fill('Data/Characters')
    await page.waitForTimeout(300)
    await targetList.getByRole('button', { name: 'Data/Characters', exact: true }).click()
    await patchDialog.getByRole('button', { name: '新增 Patch', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(600)

    // 2. The toolbar shows the history controls, both idle on an untouched draft.
    await page.locator('.workspace-patch-row-open').first().click()
    await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 20_000 })
    if ((await undoButton().count()) === 0) failures.push('the authoring toolbar has no undo button')
    if (!(await undoButton().isDisabled())) failures.push('undo is offered on a draft with no staged edit')
    if (!(await redoButton().isDisabled())) failures.push('redo is offered before anything was undone')
    await page.screenshot({ path: `${screenshotDir}/02-toolbar-idle.png` })

    // 3. Creating an entry is one undoable operation.
    await page.locator('.asset-source-mode').nth(1).click()
    await page.waitForTimeout(400)
    const before = await projectEntries()
    await page.getByRole('button', { name: '新增角色', exact: true }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const npcDialog = page.locator('.app-dialog')
    const npcInputs = npcDialog.locator('input')
    await npcInputs.nth(0).fill('{{ModId}}_Aspen')
    await npcInputs.nth(1).fill('Town')
    await npcInputs.nth(2).fill('29')
    await npcInputs.nth(3).fill('67')
    await npcDialog.getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(1000)

    const staged = await projectEntries()
    if (staged.length !== before.length + 1) failures.push(`creating an NPC produced ${staged.length - before.length} entries`)
    if (await undoButton().isDisabled()) failures.push('undo stayed disabled after staging an entry')
    await page.screenshot({ path: `${screenshotDir}/03-entry-staged.png` })

    await undoButton().click()
    await page.waitForTimeout(800)
    const undone = await projectEntries()
    if (undone.length !== before.length) failures.push(`undo left ${undone.length} entries, expected ${before.length}`)
    if (await redoButton().isDisabled()) failures.push('redo stayed disabled after an undo')
    await page.screenshot({ path: `${screenshotDir}/04-after-undo.png` })

    await redoButton().click()
    await page.waitForTimeout(800)
    if ((await projectEntries()).length !== staged.length) failures.push('redo did not restore the undone entry')

    // 4. The same history answers the keyboard, outside any text field, and one
    //    keystroke is one operation even though the page nests its own port
    //    inside the edit shell's.
    await page.locator('.asset-source-title').first().click()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(800)
    if ((await projectEntries()).length !== before.length) failures.push('Ctrl+Z did not undo the staged entry')
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(800)
    if ((await projectEntries()).length !== staged.length) failures.push('Ctrl+Shift+Z did not redo the staged entry')
    await page.screenshot({ path: `${screenshotDir}/05-after-keyboard.png` })

    // 5. A standalone page reaches the same history from its own header.
    await openModule('邮件制作')
    await page.waitForSelector('.mail-editor-assets', { state: 'visible', timeout: 20_000 })
    if ((await undoButton().count()) === 0) failures.push('the mail header has no undo button')
    await page.getByRole('button', { name: '新建信件' }).first().click()
    await page.waitForTimeout(1200)
    const letters = await page.locator('.mail-editor-letter-row').count()
    if (letters !== 1) failures.push(`creating a letter produced ${letters} rows`)
    await undoButton().click()
    await page.waitForTimeout(1000)
    if ((await page.locator('.mail-editor-letter-row').count()) !== 0) failures.push('undo did not drop the staged letter')
    await page.screenshot({ path: `${screenshotDir}/06-mail-undo.png` })

    // 6. The dialogue page commits whole entries rather than staging fields, and
    //    those commits are steps on the same history.
    await openModule('对话制作')
    await page.waitForSelector('.dialogue-editor-rail', { state: 'visible', timeout: 20_000 })
    const aspenRow = page.locator('.dialogue-editor-npc-row', { hasText: '{{ModId}}_Aspen' }).first()
    if ((await aspenRow.count()) === 0) {
      const roster = await page.locator('.dialogue-editor-rail-list').innerText()
      failures.push(`the project NPC is missing from the dialogue roster; rail reads: ${roster.replaceAll('\n', ' / ')}`)
    } else {
      await aspenRow.click()
      await page.waitForTimeout(600)
      const entriesBefore = await page.locator('.dialogue-editor-entry-row').count()
      await page.getByRole('button', { name: '新建条目', exact: true }).first().click()
      await page.waitForSelector('.dialogue-editor-topbar', { state: 'visible', timeout: 10_000 })
      await page.getByRole('button', { name: '保存条目', exact: true }).first().click()
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: '返回列表', exact: true }).first().click()
      await page.waitForTimeout(1000)
      const committed = await page.locator('.dialogue-editor-entry-row').count()
      if (committed !== entriesBefore + 1) failures.push(`saving a dialogue entry produced ${committed - entriesBefore} rows`)
      if ((await page.locator('.dialogue-editor-entry-badge[data-origin="project"]').count()) === 0) {
        failures.push('the saved dialogue entry is not marked as a project entry')
      }
      // Committing an entry only stages it: the page reports the draft as dirty
      // and leaves writing it to disk to the header, like every other page.
      if ((await page.locator('.dialogue-editor-dirty-badge').count()) === 0) {
        failures.push('committing a dialogue entry did not mark the draft as unsaved')
      }
      await page.screenshot({ path: `${screenshotDir}/07-dialogue-committed.png` })

      if ((await undoButton().count()) === 0) failures.push('the dialogue header has no undo button')
      await undoButton().click()
      await page.waitForTimeout(1200)
      const afterUndo = await page.locator('.dialogue-editor-entry-row').count()
      if (afterUndo !== entriesBefore) failures.push(`undo left ${afterUndo} dialogue rows, expected ${entriesBefore}`)
      await page.screenshot({ path: `${screenshotDir}/08-dialogue-after-undo.png` })
      await redoButton().click()
      await page.waitForTimeout(1200)
      if ((await page.locator('.dialogue-editor-entry-row').count()) !== committed) {
        failures.push('redo did not restore the undone dialogue entry')
      }
      await page.screenshot({ path: `${screenshotDir}/08-dialogue-undo.png` })

      // Saving from the header is what persists, and it clears the dirty badge.
      const saveDraftButton = page.getByRole('button', { name: '保存改动', exact: true }).first()
      if ((await saveDraftButton.count()) === 0) {
        failures.push('the dialogue header has no draft save button')
      } else {
        await saveDraftButton.click()
        await page.waitForTimeout(1500)
        if ((await page.locator('.dialogue-editor-dirty-badge').count()) !== 0) {
          failures.push('saving the dialogue draft left the unsaved badge up')
        }
        if ((await page.locator('.dialogue-editor-entry-row').count()) !== committed) {
          failures.push('saving the dialogue draft changed the entry list')
        }
        await page.screenshot({ path: `${screenshotDir}/08b-dialogue-saved.png` })
      }
    }

    // 7. The controls survive the narrow desktop width in dark theme.
    await openModule('邮件制作')
    await page.waitForSelector('.mail-editor-assets', { state: 'visible', timeout: 20_000 })
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(1000)
    const undoBox = await undoButton().evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return { x: Math.round(rect.x), width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    if (undoBox.width < 20 || undoBox.height < 20) failures.push(`the undo button collapsed at 1440: ${JSON.stringify(undoBox)}`)
    if (undoBox.x + undoBox.width > 1440) failures.push(`the undo button overflows 1440: ${JSON.stringify(undoBox)}`)
    await page.screenshot({ path: `${screenshotDir}/09-dark-1440.png` })
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`undo verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`undo verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
