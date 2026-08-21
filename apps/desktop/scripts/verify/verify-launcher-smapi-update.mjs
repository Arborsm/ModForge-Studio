import { chromium } from 'playwright'
import { existsSync } from 'node:fs'

const fallbackUrls = ['http://127.0.0.1:5175/?mfLauncherMock=1', 'http://127.0.0.1:5176/?mfLauncherMock=1']
const nexusUrlSuffix = '&mfSmapiSource=nexus'
const screenshotPath = process.env.MODFORGE_LAUNCHER_SMAPI_UPDATE_SCREENSHOT ?? '/tmp/modforge-launcher-smapi-update.png'
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)
const executablePath = executableCandidates.find((candidate) => existsSync(candidate))
const devServerHint =
  'Start the launcher mock dev server first, for example: vp run web:dev -- --host 127.0.0.1 --port 5175, then open it with ?mfLauncherMock=1.'

async function gotoSmapiUpdateTarget(page, extraQuery = '') {
  const urls = process.env.MODFORGE_LAUNCHER_SMAPI_UPDATE_URL
    ? [process.env.MODFORGE_LAUNCHER_SMAPI_UPDATE_URL]
    : fallbackUrls.map((url) => `${url}${extraQuery}`)
  let lastError = null
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 12_000 })
      return url
    } catch (error) {
      lastError = error
    }
  }
  const detail = lastError instanceof Error ? lastError.message : lastError == null ? 'No target URL responded.' : JSON.stringify(lastError)
  throw new Error(`No launcher SMAPI update target URL was available. ${devServerHint}\nLast error: ${detail}`)
}

async function verifyLibraryBadges(page) {
  // The browser dev launcher mock marks every 9th mock mod as requiring a newer SMAPI.
  await page.waitForSelector('.launcher-mod-card-requires-smapi', { state: 'visible', timeout: 10_000 })
  const badgeCount = await page.locator('.launcher-mod-card-requires-smapi').count()
  if (badgeCount < 1) {
    throw new Error('Expected at least one SMAPI requirement badge in the library grid.')
  }
  const firstBadge = page.locator('.launcher-mod-card-requires-smapi').first()
  const badgeLabel = (await firstBadge.innerText()).trim()
  if (!/^SMAPI \d/.test(badgeLabel)) {
    throw new Error(`Unexpected SMAPI badge label: ${badgeLabel}`)
  }
  const tooltip = await firstBadge.getAttribute('data-tooltip')
  if (!tooltip || !tooltip.includes('Requires SMAPI')) {
    throw new Error(`Unexpected SMAPI badge tooltip: ${tooltip}`)
  }
  console.log(`[smapi-update] library grid shows ${badgeCount} SMAPI requirement badge(s), first label "${badgeLabel}".`)
}

async function dismissGuideTourIfPresent(page) {
  if ((await page.locator('.guide-tour-backdrop').count()) > 0) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

async function openConfigurationPage(page) {
  const diagnosticsNav = page.locator('.top-menu-gooey-nav button', { hasText: 'Diagnostics' }).first()
  await diagnosticsNav.click()
  await page.waitForSelector('[data-testid="launcher-config-smapi-update"]', { state: 'visible', timeout: 10_000 })
  // The configuration page anchors a product guide tour step; dismiss it so it does not block clicks.
  await dismissGuideTourIfPresent(page)
}

async function verifyUpdateAvailableState(page) {
  const card = page.locator('[data-testid="launcher-config-smapi-update"]')
  const statusTag = card.locator('.launcher-config-status-tag')
  const statusLabel = (await statusTag.innerText()).trim()
  if (statusLabel !== 'Update available') {
    throw new Error(`Expected "Update available" status tag, got "${statusLabel}".`)
  }

  const affectedSummary = await card.locator('.launcher-config-smapi-affected').innerText()
  if (!/requires? a newer SMAPI/i.test(affectedSummary)) {
    throw new Error(`Expected affected-mod summary in the SMAPI card, got "${affectedSummary}".`)
  }
  console.log(`[smapi-update] configuration card shows "${statusLabel}" with "${affectedSummary}".`)
  return card
}

async function verifyLocalCandidateSection(page, card) {
  await page.waitForSelector('.launcher-config-smapi-local', { state: 'visible', timeout: 10_000 })
  const candidate = card.locator('.launcher-config-smapi-candidate')
  const candidateText = (await candidate.innerText()).trim()
  if (!candidateText.includes('SMAPI 4.1.10') || !candidateText.includes('Nexus naming')) {
    throw new Error(`Unexpected local candidate row: "${candidateText}".`)
  }
  const fileName = (await card.locator('.launcher-config-smapi-candidate-name').innerText()).trim()
  if (!fileName.includes('SMAPI 4.1.10-2400')) {
    throw new Error(`Unexpected local candidate file name: "${fileName}".`)
  }
  const installButton = candidate.locator('.launcher-config-button-primary')
  const installLabel = (await installButton.innerText()).trim()
  if (installLabel !== 'Install from local file') {
    throw new Error(`Expected "Install from local file" action, got "${installLabel}".`)
  }
  console.log(`[smapi-update] local candidate section shows "${fileName}".`)
  return installButton
}

async function verifyInstallSuccess(page, installButton) {
  // The browser dev launcher mock install resolves immediately and flips the cached
  // check result to up-to-date, so the card settles on "Up to date" and the header
  // env tag must show the refreshed SMAPI version.
  await dismissGuideTourIfPresent(page)
  await installButton.click()
  const card = page.locator('[data-testid="launcher-config-smapi-update"]')
  const statusTag = card.locator('.launcher-config-status-tag')
  await page.waitForFunction(
    () => {
      const text = document.querySelector('[data-testid="launcher-config-smapi-update"] .launcher-config-status-tag')?.textContent ?? ''
      return text.includes('Up to date') || text.includes('Installed')
    },
    null,
    { timeout: 10_000 },
  )
  await page.waitForFunction(
    () =>
      (document.querySelector('[data-testid="launcher-config-smapi-update"] .launcher-config-status-tag')?.textContent ?? '').includes(
        'Up to date',
      ),
    null,
    { timeout: 10_000 },
  )
  const statusLabel = (await statusTag.innerText()).trim()
  const upToDateDetail = (await card.locator('.launcher-config-smapi-detail').first().innerText()).trim()
  if (!/SMAPI 4\.1\.10 is installed/.test(upToDateDetail)) {
    throw new Error(`Unexpected up-to-date detail: "${upToDateDetail}".`)
  }
  let envSmapiLabel = ''
  for (const envTag of await page.locator('.launcher-config-env-tag').all()) {
    const text = (await envTag.innerText()).trim()
    if (text.startsWith('SMAPI')) {
      envSmapiLabel = text
    }
  }
  if (!envSmapiLabel.includes('4.1.10')) {
    throw new Error(`Expected the header env tag to show SMAPI 4.1.10 after install, got "${envSmapiLabel}".`)
  }
  console.log(`[smapi-update] install completed: "${statusLabel}" — ${upToDateDetail}; env tag "${envSmapiLabel}".`)
}

async function verifyGithubDirectFlow(page, card) {
  const updateButton = card.locator('.launcher-config-smapi-actions .launcher-config-button-primary')
  const updateLabel = (await updateButton.innerText()).trim()
  if (updateLabel !== 'Update SMAPI') {
    throw new Error(`Expected "Update SMAPI" action button, got "${updateLabel}".`)
  }
  await verifyInstallSuccess(page, updateButton)
}

async function verifyNexusManualFlow(page, card) {
  // Nexus source: the direct "Update SMAPI" action must be replaced by the manual flow.
  const actions = card.locator('.launcher-config-smapi-actions')
  if ((await actions.locator('.launcher-config-button', { hasText: 'Update SMAPI' }).count()) !== 0) {
    throw new Error('Expected no direct "Update SMAPI" action in the Nexus manual flow.')
  }
  const hint = (await card.locator('.launcher-config-smapi-hint').first().innerText()).trim()
  if (!hint.includes('Nexus')) {
    // The Nexus source hint renders right below the "Latest stable release" line.
    const nexusHintCount = await card
      .locator('.launcher-config-smapi-update-detail .launcher-config-smapi-hint', { hasText: 'Nexus' })
      .count()
    if (nexusHintCount < 1) {
      throw new Error(`Expected the Nexus source hint near the version line, got "${hint}".`)
    }
  }
  const guidance = await card.locator('.launcher-config-smapi-hint', { hasText: 'download' }).innerText()
  if (!/detect/i.test(guidance)) {
    throw new Error(`Unexpected manual-flow guidance: "${guidance}".`)
  }
  const openButton = actions.locator('.launcher-config-button-primary')
  const openLabel = (await openButton.innerText()).trim()
  if (openLabel !== 'Open Nexus download page') {
    throw new Error(`Expected "Open Nexus download page" action, got "${openLabel}".`)
  }
  const rescanLabel = (await actions.locator('.launcher-config-button', { hasText: 'Rescan' }).innerText()).trim()
  if (rescanLabel !== 'Rescan download folders') {
    throw new Error(`Expected "Rescan download folders" action, got "${rescanLabel}".`)
  }
  // Opening the popup goes through the mocked open_launcher_url command.
  await dismissGuideTourIfPresent(page)
  await openButton.click()
  await page.waitForTimeout(400)
  console.log(`[smapi-update] nexus manual flow shows "${openLabel}" + "${rescanLabel}".`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (error) => {
    console.warn(`[smapi-update] page error: ${error.message}`)
  })

  // Flow 1: library badges + local-installer offer, installed from the local file.
  const url = await gotoSmapiUpdateTarget(page)
  console.log(`[smapi-update] loaded ${url}`)
  await verifyLibraryBadges(page)
  await openConfigurationPage(page)
  let card = await verifyUpdateAvailableState(page)
  const localInstallButton = await verifyLocalCandidateSection(page, card)
  await verifyInstallSuccess(page, localInstallButton)

  // Flow 2: fresh mock state, GitHub direct download install.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.launcher-library-grid-viewport', { state: 'visible', timeout: 12_000 })
  await openConfigurationPage(page)
  card = await verifyUpdateAvailableState(page)
  await verifyGithubDirectFlow(page, card)

  // Flow 3: Nexus manual download flow (GitHub unreachable).
  const nexusUrl = await gotoSmapiUpdateTarget(page, nexusUrlSuffix)
  console.log(`[smapi-update] loaded ${nexusUrl}`)
  await openConfigurationPage(page)
  card = await verifyUpdateAvailableState(page)
  await verifyNexusManualFlow(page, card)

  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`[smapi-update] screenshot saved to ${screenshotPath}`)
  console.log('[smapi-update] OK')
} finally {
  await browser.close()
}
