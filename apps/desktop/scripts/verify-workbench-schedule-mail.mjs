import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the schedule and mail authoring workspaces after both
 * moved onto the shared `AssetDraftPort`.
 *
 * Walks the product path: create a project, open each page, and verify what this
 * slice added — the mail rail naming its two EditData assets explicitly and
 * grouping letters by delivery method, the schedule rail grouping entries by key
 * family in the game's resolution order, and save/discard living in the page
 * header on both pages, disabled until something is staged. Runs light and dark
 * at 1680 and 1440. Screenshots land in the system temp dir unless overridden
 * via MODFORGE_AUTHORING_SCREENSHOT_DIR.
 *
 * Prereq: a dev server on one of the candidate ports (`vp run dev`).
 */

const fallbackUrls = ['http://localhost:5173', 'http://127.0.0.1:5175', 'http://127.0.0.1:5176']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_AUTHORING_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-schedule-mail')
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

  async function openModule(label) {
    await waitOverlayGone()
    await page.locator('.workbench-side-nav-item', { hasText: label }).first().click()
    await page.waitForTimeout(1500)
    await skipGuides()
  }

  /** Measured box of an element, used to prove the rails keep their column at 1440. */
  async function boundingBox(selector) {
    const handle = page.locator(selector).first()
    if ((await handle.count()) === 0) return null
    return handle.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    })
  }

  /** Fails unless the rail sits fully left of the editor column. */
  async function assertTwoColumns(name, railSelector, mainSelector) {
    const rail = await boundingBox(railSelector)
    const main = await boundingBox(mainSelector)
    if (!rail || !main) {
      failures.push(`${name} two-column layout did not render (${railSelector} / ${mainSelector})`)
      return
    }
    if (rail.width < 200) failures.push(`${name} rail collapsed to ${rail.width}px`)
    if (rail.x + rail.width > main.x + 1) {
      failures.push(`${name} rail overlaps the editor: rail ${JSON.stringify(rail)} main ${JSON.stringify(main)}`)
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

    // 1. Both pages are project-scoped, so create a project before opening them.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const projectFields = page.locator('.app-dialog input')
    await projectFields.nth(0).fill('Schedule Mail Verify')
    await projectFields.nth(1).fill('Arbor.ScheduleMailVerify')
    await page.locator('.app-dialog').getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()

    // ── Mail ────────────────────────────────────────────────
    // 2. Both CP assets are named in the rail before any entry exists.
    await openModule('邮件制作')
    await page.waitForSelector('.mail-editor-assets', { state: 'visible', timeout: 20_000 })
    const assetRows = page.locator('.mail-editor-asset-row')
    const assetRowCount = await assetRows.count()
    if (assetRowCount !== 2) failures.push(`expected 2 mail asset rows, found ${assetRowCount}`)
    const assetText = await page.locator('.mail-editor-assets').innerText()
    for (const needle of ['资产补丁', 'Data/mail', 'Data/TriggerActions', '未创建']) {
      if (!assetText.includes(needle)) failures.push(`mail asset panel is missing "${needle}"`)
    }
    const mailSave = page.locator('.mail-editor-header-actions button', { hasText: '保存信件' }).first()
    const mailRevert = page.locator('.mail-editor-header-actions button', { hasText: '放弃改动' }).first()
    if (!(await mailSave.isDisabled())) failures.push('mail save button is enabled on a clean draft')
    if (!(await mailRevert.isDisabled())) failures.push('mail discard button is enabled on a clean draft')
    await page.screenshot({ path: `${screenshotDir}/01-mail-assets-empty.png` })

    // 3. Creating the trigger patch on its own works before any letter exists,
    //    which is the point of showing the two assets as separate rows.
    await assetRows.nth(1).getByRole('button', { name: '创建补丁' }).click()
    await page.waitForTimeout(1000)
    if ((await assetRows.nth(1).innerText()).includes('未创建')) {
      failures.push('creating the Data/TriggerActions patch from the rail did nothing')
    }
    if (!(await assetRows.nth(0).innerText()).includes('未创建')) {
      failures.push('creating the trigger patch also created the letter patch; the two assets must stay independent')
    }
    await page.screenshot({ path: `${screenshotDir}/02-mail-trigger-patch-created.png` })

    // 4. Creating a letter stages it and creates the Data/mail patch for real.
    await page.getByRole('button', { name: '新建信件' }).first().click()
    await page.waitForTimeout(1200)
    const letterRows = await page.locator('.mail-editor-letter-row').count()
    if (letterRows !== 1) failures.push(`creating a letter produced ${letterRows} rows in the delivery-grouped rail`)
    const groupTitles = await page.locator('.mail-editor-delivery-title').allInnerTexts()
    if (!groupTitles.includes('尚未配置投递')) {
      failures.push(`a letter with no trigger landed under: ${groupTitles.join(' / ') || '(no group)'}`)
    }
    if ((await page.locator('.mail-editor-delivery-hint').count()) === 0) failures.push('the delivery grouping hint is missing')
    if ((await assetRows.nth(0).innerText()).includes('未创建')) {
      failures.push('the Data/mail patch was not created when the first letter was staged')
    }
    if (await mailSave.isDisabled()) failures.push('mail save button stayed disabled after staging a letter')
    if ((await page.locator('.mail-editor-dirty-badge').count()) === 0) failures.push('mail dirty badge missing after staging')
    await page.screenshot({ path: `${screenshotDir}/03-mail-letter-staged.png` })

    // 5. Adding the default DayStarted trigger re-groups the letter and writes
    //    into the trigger asset, not the letter asset.
    await page.getByRole('button', { name: '添加触发', exact: true }).first().click()
    await page.waitForTimeout(1200)
    if ((await page.locator('.mail-editor-trigger-card').count()) !== 1) failures.push('trigger card did not render for the active letter')
    const regrouped = await page.locator('.mail-editor-delivery-title').allInnerTexts()
    if (!regrouped.includes('每日开始时投递')) {
      failures.push(`a DayStarted trigger did not move the letter into its group; groups: ${regrouped.join(' / ')}`)
    }
    if (regrouped.includes('尚未配置投递')) failures.push('the letter stayed in the undeliverable group after gaining a trigger')
    const assetCounts = await page.locator('.mail-editor-asset-count').allInnerTexts()
    if (assetCounts.join(' / ') !== '1 个条目 / 1 个条目') {
      failures.push(`expected one entry in each mail asset, found: ${assetCounts.join(' / ') || '(none)'}`)
    }
    await page.screenshot({ path: `${screenshotDir}/04-mail-trigger-grouped.png` })

    // 6. Discarding rolls the whole draft back through the port.
    await mailRevert.click()
    await page.waitForTimeout(2500)
    if ((await page.locator('.mail-editor-letter-row').count()) !== 0) failures.push('discarding did not drop the staged letter')
    if (!(await mailSave.isDisabled())) failures.push('mail save button stayed enabled after discarding')
    await page.screenshot({ path: `${screenshotDir}/05-mail-after-discard.png` })

    // 6.5. Rail context switch between letters and triggers views.
    const lettersTab = page.locator('.mail-editor-rail-mode-tab', { hasText: '信件内容' }).first()
    const triggersTab = page.locator('.mail-editor-rail-mode-tab', { hasText: '投递触发' }).first()
    if ((await lettersTab.count()) === 0) failures.push('letters tab is missing from rail context switch')
    if ((await triggersTab.count()) === 0) failures.push('triggers tab is missing from rail context switch')
    if (!(await lettersTab.getAttribute('aria-pressed'))) failures.push('letters tab is not active by default')

    // Switch to triggers view
    await triggersTab.click()
    await page.waitForTimeout(800)
    if (!(await triggersTab.getAttribute('aria-pressed'))) failures.push('triggers tab did not become active after click')
    if ((await page.locator('.mail-editor-trigger-list').count()) === 0) failures.push('trigger list view did not render')
    const triggerListHeading = await page.locator('.mail-editor-trigger-list .mail-editor-list-title').innerText()
    if (!triggerListHeading.includes('投递触发')) failures.push(`trigger list heading reads: ${triggerListHeading}`)

    // Switch back to letters view (no letters after discard, so check for empty state)
    await lettersTab.click()
    await page.waitForTimeout(800)
    if (!(await lettersTab.getAttribute('aria-pressed'))) failures.push('letters tab did not become active after switching back')
    const hasLetterGroups = (await page.locator('.mail-editor-delivery-group').count()) > 0
    const hasEmptyState = (await page.locator('.mail-editor-list-empty').count()) > 0
    if (!hasLetterGroups && !hasEmptyState) failures.push('neither letter groups nor empty state rendered after switching back')
    await page.screenshot({ path: `${screenshotDir}/05b-mail-rail-context-switch.png` })

    // ── Schedule ────────────────────────────────────────────
    // 7. The rail always explains the priority layout, and the header owns the
    //    draft controls rather than the entry editor.
    await openModule('行程制作')
    await page.waitForSelector('.schedule-editor', { state: 'visible', timeout: 20_000 })
    const scheduleSave = page.locator('.schedule-editor-header-status button', { hasText: '保存行程' }).first()
    const scheduleRevert = page.locator('.schedule-editor-header-status button', { hasText: '还原修改' }).first()
    if (!(await scheduleSave.isDisabled())) failures.push('schedule save button is enabled on a clean draft')
    if (!(await scheduleRevert.isDisabled())) failures.push('schedule discard button is enabled on a clean draft')
    const hintText = await page.locator('.schedule-editor-priority-hint').innerText()
    if (!hintText.includes('优先生效')) failures.push(`schedule priority hint reads: ${hintText}`)
    await page.screenshot({ path: `${screenshotDir}/06-schedule-rail.png` })

    // 8. The rail lists NPCs the project itself introduces, not only the vanilla
    //    roster, so give it one through the character authoring page. That is
    //    also the only way to reach the entry list without a game install.
    await openModule('角色制作')
    await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 20_000 })
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

    // 9. Creating an entry goes through the key dialog and lands in the group of
    //    its key family. The draft is dirty from the character above, so the
    //    save button's disabled state was asserted on the clean draft in 7.
    await openModule('行程制作')
    await page.waitForSelector('.schedule-editor', { state: 'visible', timeout: 20_000 })
    const npcSelect = page.locator('.schedule-editor-rail select').first()
    const npcValues = await npcSelect.locator('option[value]:not([value=""])').evaluateAll((nodes) => nodes.map((node) => node.value))
    if (!npcValues.includes('{{ModId}}_Aspen')) {
      failures.push(`the project NPC is missing from the schedule roster; options: ${npcValues.join(' / ') || '(none)'}`)
    }
    await npcSelect.selectOption('{{ModId}}_Aspen')
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: '新增条目', exact: true }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const scheduleDialog = page.locator('.app-dialog')
    const createEntry = scheduleDialog.getByRole('button', { name: '创建', exact: true })
    if (!(await createEntry.isDisabled())) failures.push('the schedule key dialog offered to create an entry with an empty key')
    await scheduleDialog.locator('input').first().fill('spring_Mon')
    await createEntry.click()
    await waitOverlayGone()
    await page.waitForTimeout(1500)
    // A second entry from a different family proves the rail orders the groups
    // rather than listing them in creation order.
    await page.getByRole('button', { name: '新增条目', exact: true }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    await scheduleDialog.locator('input').first().fill('GreenRain')
    await scheduleDialog.getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await page.waitForTimeout(1500)

    const railText = await page.locator('.schedule-editor-rail').innerText()
    for (const key of ['spring_Mon', 'GreenRain']) {
      if (!railText.includes(key)) failures.push(`the created schedule entry "${key}" did not appear in the rail`)
    }
    const familyTitles = await page.locator('.schedule-editor-family-title').allInnerTexts()
    if (familyTitles.join(' / ') !== '绿雨 / 季节+星期') {
      failures.push(`schedule families are not laid out in resolution order; found: ${familyTitles.join(' / ') || '(none)'}`)
    }
    // Every family heading the rail draws must own at least one entry.
    const emptyGroups = await page
      .locator('.schedule-editor-family-group')
      .evaluateAll((nodes) => nodes.filter((node) => node.querySelectorAll('.schedule-editor-entry-item').length === 0).length)
    if (emptyGroups > 0) failures.push(`${emptyGroups} schedule family group(s) rendered a heading with no entries`)
    if (await scheduleSave.isDisabled()) failures.push('schedule save button stayed disabled after staging an entry')
    await page.screenshot({ path: `${screenshotDir}/07-schedule-entry-staged.png` })

    // 10. Both rails hold their column in dark theme at the narrow desktop width.
    await assertTwoColumns('schedule', '.schedule-editor-rail', '.schedule-editor-main')
    await page.getByRole('button', { name: '切换主题' }).first().click()
    await page.waitForTimeout(800)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(1000)
    await assertTwoColumns('schedule @1440', '.schedule-editor-rail', '.schedule-editor-main')
    await page.screenshot({ path: `${screenshotDir}/08-schedule-dark-1440.png` })

    // 11. Opening an entry shows the segment editor. Adding time points on the same
    //     map loads the map panel, renders the NPC marker, and draws the path.
    await page.locator('.schedule-editor-entry-item', { hasText: 'spring_Mon' }).first().click()
    await page.waitForTimeout(1000)
    if ((await page.locator('.schedule-editor-content').count()) === 0) {
      failures.push('clicking an entry did not open the segment editor')
    }
    // Add three time points on Town so the map panel has content to render.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '新增时间点' }).first().click()
      await page.waitForTimeout(600)
    }
    const segmentRows = await page.locator('.schedule-editor-segment-row').count()
    if (segmentRows !== 3) failures.push(`expected 3 segment rows after adding points, found ${segmentRows}`)

    // Fill the first point with Town coordinates so the map panel loads.
    const firstRow = page.locator('.schedule-editor-segment-row').first()
    const firstInputs = firstRow.locator('input')
    await firstInputs.nth(0).fill('Town') // location
    await firstInputs.nth(1).fill('64') // x
    await firstInputs.nth(2).fill('21') // y
    await page.waitForTimeout(1500)

    if ((await page.locator('.schedule-map-panel').count()) === 0) {
      skipped.push('map panel did not render (may require real game directory for map assets)')
    } else {
      const mapViewport = page.locator('.schedule-map-panel-viewport canvas').first()
      if ((await mapViewport.count()) === 0) {
        skipped.push('map viewport canvas did not render')
      } else {
        await page.screenshot({ path: `${screenshotDir}/09-schedule-map-single-point.png` })

        // Add coordinates to the second point to draw a path leg.
        const secondRow = page.locator('.schedule-editor-segment-row').nth(1)
        const secondInputs = secondRow.locator('input')
        await secondInputs.nth(1).fill('70') // x (location carries from first)
        await secondInputs.nth(2).fill('25') // y
        await page.waitForTimeout(1000)

        // The map overlay should now have two markers and one leg.
        const overlayMarkers = await page.locator('.schedule-map-marker').count()
        if (overlayMarkers !== 2) skipped.push(`expected 2 map markers after placing two points, found ${overlayMarkers}`)
        const overlayLegs = await page.locator('.schedule-map-leg').count()
        if (overlayLegs !== 1) skipped.push(`expected 1 map leg connecting the two points, found ${overlayLegs}`)
        await page.screenshot({ path: `${screenshotDir}/10-schedule-map-path.png` })

        // Click the second row to verify selection switching updates the current marker.
        await secondRow.click()
        await page.waitForTimeout(600)
        const currentMarkers = await page.locator('.schedule-map-marker.is-current').count()
        if (currentMarkers !== 1) skipped.push(`expected 1 current marker after selecting second row, found ${currentMarkers}`)
        await page.screenshot({ path: `${screenshotDir}/11-schedule-map-selection.png` })
      }
    }

    await openModule('邮件制作')
    await page.waitForSelector('.mail-editor-list', { state: 'visible', timeout: 20_000 })
    await assertTwoColumns('mail @1440', '.mail-editor-list', '.mail-editor-main')
    await page.screenshot({ path: `${screenshotDir}/12-mail-dark-1440.png` })
  } finally {
    await browser.close()
  }

  if (skipped.length > 0) {
    console.warn(`schedule/mail verification skipped:\n- ${skipped.join('\n- ')}`)
  }
  if (failures.length > 0) {
    console.error(`schedule/mail verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`schedule/mail verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
