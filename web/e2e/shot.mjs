// Ad-hoc screenshot helper: node e2e/shot.mjs <path> <out.png> [appearance] [width] [user]
import { chromium } from '@playwright/test'
const [, , path = '/', out = 'shot.png', appearance = 'light', width = '1440', user] = process.argv
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } })
await page.addInitScript((a) => localStorage.setItem('bistro.appearance', a), appearance)
const base = process.env.BISTRO_WEB_URL ?? 'http://127.0.0.1:5173'
if (user) {
  await page.goto(base + '/login')
  await page.getByLabel('Username').fill(user)
  await page.getByLabel('Password', { exact: true }).fill(process.env.BISTRO_PW ?? 'bistro-demo-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 })
}
await page.goto(base + path)
await page.waitForTimeout(Number(process.env.WAIT ?? 1500))
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
console.log('saved', out, errors.join('\n'))
await browser.close()
