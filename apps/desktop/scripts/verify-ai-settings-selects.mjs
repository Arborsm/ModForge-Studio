import { chromium } from 'playwright'

// Verifies the AI settings panel dropdowns are rendered with the project's
// self-built CompactSelect (no native <select>), that they open, list options,
// respond to keyboard, and that the reasoning-effort dial is enabled on the
// DeepSeek profile. Run against the dev server with the settings mock:
//   vp run web:dev  (then in another shell)
//   node ./scripts/verify-ai-settings-selects.mjs
const targetUrl = process.env.MODFORGE_AI_SETTINGS_URL ?? 'http://127.0.0.1:5173/?mfSettingsMock=1&mfOpenSettings=ai'
const screenshotBase = process.env.MODFORGE_AI_SETTINGS_SHOT_DIR || 'C:/Users/26537/AppData/Local/Temp'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function shot(page, name) {
  return page.screenshot({ path: `${screenshotBase}/modforge-ai-settings-${name}.png`, fullPage: false })
}

async function openSelect(page, selector) {
  await page.locator(selector).click()
  await page.waitForSelector('.compact-select__menu', { state: 'visible', timeout: 3_000 })
  await page.waitForTimeout(120)
}

async function optionLabels(page) {
  return page.$$eval('.compact-select__option-label', (nodes) => nodes.map((node) => node.textContent?.trim() ?? ''))
}

const browser = await chromium.launch({ executablePath: chromiumExecutable, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 })

const findings = {
  url: targetUrl,
  nativeSelects: null,
  compactSelects: null,
  preset: null,
  protocol: null,
  effort: null,
  keyboard: null,
  deepseek: null,
}

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('.settings-ai-profile-detail', { state: 'visible', timeout: 30_000 })
  await page.waitForSelector('.settings-ai-profile-list-item', { state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(600)

  // 1. No native selects remain in the AI settings panel; the dropdowns are
  //    CompactSelect triggers (profile grid) + import policy uses the same
  //    component class when the import preview renders.
  findings.nativeSelects = await page.$$eval('.settings-ai-section select', (nodes) => nodes.length)
  findings.compactSelects = await page.$$eval('.settings-ai-section .compact-select', (nodes) => nodes.length)
  await shot(page, '01-profile-grid')

  // 2. Provider preset dropdown: open, list options, pick Anthropic.
  const presetTrigger = '.settings-ai-grid .compact-select__trigger >> nth=0'
  const protocolTrigger = '.settings-ai-grid .compact-select__trigger >> nth=1'
  await openSelect(page, presetTrigger)
  findings.preset = { open: true, options: await optionLabels(page) }
  await page.locator('.compact-select__option', { hasText: 'Anthropic' }).click()
  await page.waitForTimeout(150)
  findings.preset.selected = (await page.locator(presetTrigger).innerText()).trim()
  await shot(page, '02-preset-selected-anthropic')

  // 3. Protocol dropdown: open, list options, pick openai-chat-completions.
  await openSelect(page, protocolTrigger)
  findings.protocol = { open: true, options: await optionLabels(page) }
  await page.locator('.compact-select__option', { hasText: 'openai-chat-completions' }).click()
  await page.waitForTimeout(150)
  findings.protocol.selected = (await page.locator(protocolTrigger).innerText()).trim()

  // 4. Reasoning effort dropdown on the DeepSeek profile: the dial must be
  //    enabled (no DeepSeek-specific disable). Select the DeepSeek profile,
  //    expand advanced params, open the effort select.
  await page.locator('.settings-ai-profile-list-item', { hasText: 'DeepSeek' }).click()
  await page.waitForTimeout(300)
  await page.locator('.settings-ai-advanced-toggle').click()
  await page.waitForTimeout(200)
  const effortTrigger = '.settings-ai-advanced-grid .compact-select__trigger'
  await page.waitForSelector(effortTrigger, { state: 'visible', timeout: 5_000 })
  findings.deepseek = {
    effortTriggerDisabled: await page.locator(effortTrigger).isDisabled(),
    effortTriggerText: (await page.locator(effortTrigger).innerText()).trim(),
  }
  await shot(page, '03-deepseek-effort-enabled')
  await openSelect(page, effortTrigger)
  findings.effort = { open: true, options: await optionLabels(page) }
  await page.locator('.compact-select__option', { hasText: 'High' }).click()
  await page.waitForTimeout(150)
  findings.effort.selected = (await page.locator(effortTrigger).innerText()).trim()

  // 5. Keyboard operation: focus the preset trigger, ArrowDown opens the
  //    listbox, Escape closes it.
  await page.locator(presetTrigger).focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForSelector('.compact-select__menu', { state: 'visible', timeout: 3_000 })
  const keyboardOpened = (await page.$$('.compact-select__option')).length > 0
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  findings.keyboard = { arrowDownOpened: keyboardOpened, escapeClosed: (await page.$('.compact-select__menu')) === null }

  console.log(JSON.stringify({ findings, screenshotBase }, null, 2))

  if (findings.nativeSelects !== 0) {
    throw new Error(`Native <select> elements remain in the AI settings panel: ${findings.nativeSelects}`)
  }
  if (findings.compactSelects < 2) {
    throw new Error(`Expected at least 2 CompactSelect dropdowns in the profile grid, got ${findings.compactSelects}`)
  }
  if (!findings.preset.open || !findings.preset.options.includes('Anthropic') || !findings.preset.options.includes('DeepSeek')) {
    throw new Error(`Provider preset dropdown did not list the expected presets: ${JSON.stringify(findings.preset)}`)
  }
  if (findings.preset.selected !== 'Anthropic') {
    throw new Error(`Provider preset did not select Anthropic: ${JSON.stringify(findings.preset)}`)
  }
  if (findings.protocol.selected !== 'openai-chat-completions') {
    throw new Error(`Protocol dropdown did not select openai-chat-completions: ${JSON.stringify(findings.protocol)}`)
  }
  if (findings.deepseek.effortTriggerDisabled) {
    throw new Error('DeepSeek reasoning-effort dial must be enabled after the effort support fix.')
  }
  if (!findings.effort.open || !findings.effort.options.includes('X-High') || findings.effort.selected !== 'High') {
    throw new Error(`Reasoning-effort dropdown misbehaved: ${JSON.stringify(findings.effort)}`)
  }
  if (!findings.keyboard.arrowDownOpened || !findings.keyboard.escapeClosed) {
    throw new Error(`Keyboard operation failed: ${JSON.stringify(findings.keyboard)}`)
  }

  console.log('AI settings selects verification passed.')
} finally {
  await browser.close()
}
