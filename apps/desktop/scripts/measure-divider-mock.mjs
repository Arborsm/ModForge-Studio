import { chromium } from 'playwright'
import { join } from 'node:path'

const path = join(process.cwd(), 'prototype', 'item-workspace-divider-mock.html').replace(/\\/g, '/')

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 500 } })
  await page.goto('file:///' + path)
  await page.waitForSelector('.item-workspace-pane')

  const result = await page.evaluate(() => {
    const workspace = document.querySelector('.workspace')
    const panes = document.querySelectorAll('.item-workspace-pane')
    const dividers = document.querySelectorAll('.item-workspace-divider')

    const wsRect = workspace.getBoundingClientRect()
    const navRect = panes[0].getBoundingClientRect()
    const catRect = panes[1].getBoundingClientRect()
    const detRect = panes[2].getBoundingClientRect()
    const div1 = dividers[0].getBoundingClientRect()
    const div2 = dividers[1].getBoundingClientRect()

    const pseudo1 = window.getComputedStyle(dividers[0], '::before')
    const pseudo2 = window.getComputedStyle(dividers[1], '::before')

    return {
      workspace: { x: wsRect.x, width: wsRect.width },
      nav: { x: navRect.x, right: navRect.right, width: navRect.width },
      catalog: { x: catRect.x, right: catRect.right, width: catRect.width },
      detail: { x: detRect.x, width: detRect.width },
      divider1: { x: div1.x, right: div1.right, width: div1.width },
      divider2: { x: div2.x, right: div2.right, width: div2.width },
      pseudo1: {
        width: pseudo1.width,
        left: pseudo1.left,
        right: pseudo1.right,
        backgroundColor: pseudo1.backgroundColor,
      },
      pseudo2: {
        width: pseudo2.width,
        left: pseudo1.left,
        right: pseudo1.right,
      },
      gap1Center: navRect.right + (catRect.x - navRect.right) / 2,
      divider1Center: div1.x + div1.width / 2,
    }
  })

  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
