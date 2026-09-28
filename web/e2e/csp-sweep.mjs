// Visits every screen through a production-like server and fails on any CSP violation or
// console error. Usage: BISTRO_WEB_URL=http://127.0.0.1:8088 node e2e/csp-sweep.mjs
import { chromium } from '@playwright/test'
const base = process.env.BISTRO_WEB_URL ?? 'http://127.0.0.1:8088'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const problems = []
page.on('console', (m) => { if (m.type() === 'error' && !(m.text().includes('401') && page.url().endsWith('/login'))) problems.push(`console @ ${page.url()}: ${m.text()}`) })
page.on('pageerror', (e) => problems.push(`pageerror @ ${page.url()}: ${e.message}`))
await page.exposeFunction('reportViolation', (v) => problems.push(`CSP @ ${page.url()}: ${v}`))
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    window.reportViolation(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} ${e.sample || ''}`)
  })
})
await page.goto(base + '/login')
await page.getByLabel('Username').fill('owner')
await page.getByLabel('Password', { exact: true }).fill(process.env.BISTRO_PW ?? 'bistro-demo-1')
await page.getByRole('button', { name: 'Sign in' }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
const paths = ['/dashboard', '/floor', '/orders', '/kitchen', '/bills', '/menu', '/tables', '/reports', '/staff', '/roles', '/settings', '/audit', '/account', '/more', '/nope']
for (const p of paths) {
  await page.goto(base + p)
  await page.waitForTimeout(1200)
}
// First order and bill detail pages, plus overlays (Radix portals, focus locks, scroll locks).
await page.goto(base + '/orders')
await page.waitForTimeout(800)
const row = page.locator('tbody tr').first()
if (await row.count()) { await row.click(); await page.waitForTimeout(1500) }
await page.goto(base + '/bills')
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /^Appearance:/ }).click()
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.getByRole('button', { name: /^Account:/ }).click()
await page.getByRole('menuitem', { name: 'Sign out' }).click()
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.goto(base + '/staff')
await page.waitForTimeout(1000)
await page.locator('tbody tr').first().click()
await page.waitForTimeout(1000)
await page.keyboard.press('Escape')
await page.goto(base + '/floor')
await page.waitForTimeout(1000)
await page.locator('[data-table-card], [aria-roledescription], button').filter({ hasText: /T1\b/ }).first().click().catch(() => {})
await page.waitForTimeout(1000)
console.log(problems.length ? problems.join('\n') : 'no CSP violations or console errors')
await browser.close()
process.exit(problems.length ? 1 : 0)
