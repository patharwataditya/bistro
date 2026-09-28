import { expect, test } from '@playwright/test'
import { PASSWORD, signIn, signOut } from './helpers'

test.describe('sign-in and sessions', () => {
  test('a protected address sends you to sign in and back', async ({ page }) => {
    await page.goto('/kitchen')
    await expect(page).toHaveURL(/\/login\?next=%2Fkitchen/)
    await page.getByLabel('Username').fill('chef')
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/kitchen$/)
  })

  test('wrong credentials are refused with a clear message', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Username').fill('nobody-e2e')
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/incorrect/i)
    await expect(page).toHaveURL(/\/login/)
  })

  test('an off-site "next" address is ignored', async ({ page }) => {
    await signIn(page, 'server', '/login?next=https%3A%2F%2Fevil.example%2F')
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:5173').host)
  })

  test('tokens never reach script-readable storage; the refresh cookie is locked down', async ({ page, context }) => {
    await signIn(page, 'manager')
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toMatch(/eyJ|token/i)
    expect(await page.evaluate(() => document.cookie)).toBe('')
    const cookie = (await context.cookies()).find((c) => c.name.endsWith('bistro_rt'))
    expect(cookie).toBeDefined()
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Strict')
    expect(cookie?.path).toBe('/')
  })

  test('a reload keeps you signed in', async ({ page }) => {
    await signIn(page, 'manager')
    await page.goto('/orders')
    await page.reload()
    await expect(page).toHaveURL(/\/orders$/)
    await expect(page.getByRole('button', { name: /^Account:/ })).toBeVisible()
  })

  test('signing out ends the session in every tab', async ({ page, context }) => {
    await signIn(page, 'manager')
    const other = await context.newPage()
    await other.goto('/orders')
    await expect(other.getByRole('button', { name: /^Account:/ })).toBeVisible()
    await signOut(page)
    await expect(other).toHaveURL(/\/login/)
    await page.reload()
    await expect(page).toHaveURL(/\/login/)
    expect((await context.cookies()).find((c) => c.name.endsWith('bistro_rt'))).toBeUndefined()
  })
})

test.describe('access by role', () => {
  test('the kitchen role sees only what it may use', async ({ page }) => {
    await signIn(page, 'chef')
    const nav = page.getByRole('navigation', { name: 'Main navigation' }).first()
    await expect(nav.getByRole('link', { name: 'Kitchen' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Bills' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: /Staff/ })).toHaveCount(0)
    await page.goto('/staff')
    await expect(page.getByText('Not available to you')).toBeVisible()
  })

  test('the server refuses what the role lacks, whatever the browser sends', async ({ page }) => {
    await signIn(page, 'chef')
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/web/refresh', { method: 'POST', headers: { 'X-Bistro-Client': 'web' }, credentials: 'same-origin' })
      const { access_token } = (await r.json()) as { access_token: string }
      const res = await fetch('/api/v1/users', { headers: { Authorization: `Bearer ${access_token}` } })
      return res.status
    })
    expect(status).toBe(403)
  })

  test('the refresh endpoint refuses requests without the web client header', async ({ page }) => {
    await signIn(page, 'chef')
    const status = await page.evaluate(async () => (await fetch('/api/v1/auth/web/refresh', { method: 'POST', credentials: 'same-origin' })).status)
    expect(status).toBe(403)
  })
})

test.describe('appearance', () => {
  test('exactly three modes, remembered across reloads', async ({ page }) => {
    await signIn(page, 'server')
    await page.getByRole('button', { name: /^Appearance:/ }).click()
    const options = page.getByRole('menuitemradio')
    await expect(options).toHaveCount(3)
    await expect(options).toHaveText([/Light/, /Dark/, /Black/])
    await page.getByRole('menuitemradio', { name: /Black/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'black')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'black')
  })
})
