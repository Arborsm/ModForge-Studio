import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Visual smoke test for the project-creation flow and pack-structure surfaces.
 *
 * Walks: the create dialog's template picker and progressive disclosure
 * (advanced manifest fields stay collapsed until asked for), template-driven
 * creation landing directly in an authoring module, the project settings page
 * (ConfigSchema / DynamicTokens / CustomLocations / AliasTokenNames / Format),
 * the map workspace's target list with automatic patch resolution, the expert
 * patch list in project-content, the per-patch settings dialog with its
 * advanced disclosure and TargetField, the EditData advanced-operations
 * strip, and the export preflight panel.
 *
 * Prereq: `vp run web:dev -- --host 127.0.0.1 --port 5175`
 */

const fallbackUrls = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://localhost:5173']
const mockQuery = '/?mfLauncherMock=1&mfSettingsMock=1'
const screenshotDir = process.env.MODFORGE_PROJECT_FLOW_SCREENSHOT_DIR ?? path.join(os.tmpdir(), 'modforge-workbench-project-flow')
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

  try {
    let opened = null
    for (const url of process.env.MODFORGE_PROJECT_FLOW_URL ? [process.env.MODFORGE_PROJECT_FLOW_URL] : fallbackUrls) {
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

    // 1. The create dialog offers content templates and keeps advanced
    //    manifest fields behind the disclosure.
    await page.getByRole('button', { name: '新建项目' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const createDialog = page.locator('.app-dialog')
    for (const template of ['空白内容包', 'NPC 角色', '自定义物品', '自定义建筑', '地图修改', '剧情事件', '信件与触发器']) {
      if (!(await createDialog.innerText()).includes(template)) failures.push(`create dialog is missing the "${template}" template`)
    }
    const dialogTextBeforeExpand = await createDialog.innerText()
    if (dialogTextBeforeExpand.includes('ContentPackFor UniqueID')) {
      failures.push('advanced manifest fields are visible before expanding the disclosure')
    }
    await createDialog
      .getByRole('button', { name: /高级选项/ })
      .first()
      .click()
    await page.waitForTimeout(300)
    const dialogTextAfterExpand = await createDialog.innerText()
    for (const label of ['ContentPackFor UniqueID', 'UpdateKeys', '依赖']) {
      if (!dialogTextAfterExpand.includes(label)) failures.push(`advanced disclosure is missing "${label}"`)
    }
    await page.screenshot({ path: `${screenshotDir}/01-create-dialog-advanced.png` })

    // UniqueID derives from author + name once both are filled.
    const createInputs = createDialog.locator('input')
    await createInputs.nth(0).fill('Flow Verify')
    await createInputs.nth(2).fill('Arbor')
    await page.waitForTimeout(300)
    const derivedUniqueId = await createInputs.nth(1).inputValue()
    if (derivedUniqueId !== 'Arbor.FlowVerify') failures.push(`UniqueID derived "${derivedUniqueId}" instead of Arbor.FlowVerify`)

    // 2. The NPC template lands directly in the character editor with its
    //    singleton patch ensured — no patch list, no patch picking.
    await createDialog
      .getByRole('button', { name: /NPC 角色/ })
      .first()
      .click()
    await createDialog.getByRole('button', { name: '创建', exact: true }).click()
    await waitOverlayGone()
    await skipGuides()
    await page.waitForSelector('.asset-source-pane', { state: 'visible', timeout: 20_000 })
    if ((await page.locator('.workspace-patch-list').count()) !== 0) {
      failures.push('NPC template creation landed on a patch list instead of the character editor')
    }
    await page.screenshot({ path: `${screenshotDir}/02-template-lands-in-editor.png` })

    // 3. The EditData advanced-operations strip hangs below the editor,
    //    collapsed until opened.
    const bodyTextBeforeOps = await page.locator('body').innerText()
    if (bodyTextBeforeOps.includes('TextOperations：文本操作')) {
      failures.push('advanced operations render expanded by default')
    }
    await page
      .getByRole('button', { name: /高级操作/ })
      .first()
      .click()
    await page.waitForTimeout(300)
    const bodyTextAfterOps = await page.locator('body').innerText()
    for (const label of ['Fields：按字段局部修改', 'MoveEntries：调整条目顺序', 'TextOperations：文本操作']) {
      if (!bodyTextAfterOps.includes(label)) failures.push(`advanced operations are missing "${label}"`)
    }
    await page.screenshot({ path: `${screenshotDir}/03-editdata-advanced-ops.png` })
    await page
      .getByRole('button', { name: /高级操作/ })
      .first()
      .click()
    await page.waitForTimeout(200)

    // 4. The per-patch settings dialog groups rare fields under its own
    //    disclosure, including TargetField.
    await page.getByRole('button', { name: '补丁设置' }).first().click()
    await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
    const patchDialog = page.locator('.app-dialog')
    const patchDialogText = await patchDialog.innerText()
    if (!patchDialogText.includes('启用状态')) failures.push('patch settings dialog lost the Enabled control')
    if (patchDialogText.includes('TargetField\n')) failures.push('TargetField should stay behind the advanced disclosure')
    await patchDialog
      .getByRole('button', { name: /更多高级选项/ })
      .first()
      .click()
    await page.waitForTimeout(300)
    const patchDialogAdvanced = await patchDialog.innerText()
    for (const label of ['优先级', 'TargetField', '局部令牌']) {
      if (!patchDialogAdvanced.includes(label)) failures.push(`patch settings advanced disclosure is missing "${label}"`)
    }
    await page.screenshot({ path: `${screenshotDir}/04-patch-settings-advanced.png` })
    await patchDialog.getByRole('button', { name: '取消' }).first().click()
    await waitOverlayGone()

    // 5. The project settings page carries every top-level structure.
    await page.locator('.workbench-side-nav-item', { hasText: '项目设置' }).first().click()
    await page.waitForTimeout(1200)
    await skipGuides()
    const settingsText = await page.locator('body').innerText()
    for (const label of ['基本信息', '配置项', '动态令牌', '自定义位置', '令牌别名', '2.9.0']) {
      if (!settingsText.includes(label)) failures.push(`project settings page is missing "${label}"`)
    }
    await page.getByRole('button', { name: '添加动态令牌' }).first().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${screenshotDir}/05-project-settings.png` })

    // 6. The map workspace lists vanilla maps and location data; opening one
    //    ensures the right patch kind automatically.
    await page.locator('.workbench-side-nav-item', { hasText: '地图制作' }).first().click()
    await page.waitForTimeout(1200)
    await skipGuides()
    const mapListText = await page.locator('body').innerText()
    for (const label of ['游戏原版地图', '位置数据', '新建地图']) {
      if (!mapListText.includes(label)) failures.push(`map target list is missing "${label}"`)
    }
    await page.screenshot({ path: `${screenshotDir}/06-map-target-list.png` })
    await page.getByPlaceholder('搜索地图…').fill('town')
    await page.waitForTimeout(400)
    await page
      .getByRole('button', { name: /Maps\/Town/ })
      .first()
      .click()
    await page.waitForTimeout(1500)
    const mapEditorText = await page.locator('body').innerText()
    if (!mapEditorText.includes('Maps/Town')) failures.push('opening a map target did not land in the map editor')
    await page.screenshot({ path: `${screenshotDir}/07-map-editor.png` })

    // 7. Back on the list, the ensured patch shows up under project maps.
    await page.getByRole('button', { name: '后退' }).first().click()
    await page.waitForTimeout(800)
    const mapListAfter = await page.locator('body').innerText()
    if (!mapListAfter.includes('项目中的地图')) failures.push('the ensured map patch did not surface in the project section')

    // 8. The project-content module renders its overview fallback. The legacy
    //    expert patch list (AddPatchDialog) was removed with the authoring
    //    rework; patch management now lives in each authoring workspace.
    await page.locator('.workbench-side-nav-item', { hasText: '项目内容' }).first().click()
    await page.waitForTimeout(1200)
    await skipGuides()
    const projectContentText = await page.locator('body').innerText()
    if (!projectContentText.includes('项目内容总览')) failures.push('project-content module did not render its overview fallback')
    await page.screenshot({ path: `${screenshotDir}/08-project-content.png` })

    // 9. The export dialog runs the preflight and reports its verdict.
    await page.locator('.workbench-side-nav-item', { hasText: '项目主页' }).first().click()
    await page.waitForTimeout(1200)
    await skipGuides()
    const exportButton = page.getByRole('button', { name: /导出/ }).first()
    if ((await exportButton.count()) === 0) {
      failures.push('no export entry found on the project dashboard')
    } else {
      await exportButton.click()
      await page.waitForSelector('.app-dialog', { state: 'visible', timeout: 10_000 })
      const exportDialogText = await page.locator('.app-dialog').innerText()
      if (!exportDialogText.includes('导出前检查')) failures.push('export dialog is missing the preflight panel')
      await page.screenshot({ path: `${screenshotDir}/09-export-preflight.png` })
      await page.keyboard.press('Escape')
      await waitOverlayGone()
    }
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`workbench project-flow verification failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`workbench project-flow verification passed; screenshots in ${screenshotDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
