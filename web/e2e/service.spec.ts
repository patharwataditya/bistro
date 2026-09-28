import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { PASSWORD, signIn } from './helpers'

/**
 * One table visit end to end, each step by the role that does it in a restaurant:
 * the server seats and orders, the kitchen cooks, the server serves, the cashier bills and
 * takes payment. Runs against the real API on a throwaway table that is removed afterwards.
 */

const tableName = `E2E${Date.now().toString(36).slice(-6).toUpperCase()}`
let ownerToken = ''
let tableId = 0
let itemName = ''

async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const res = await request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${ownerToken}` },
  })
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy()
  return res.status() === 204 ? null : res.json()
}

async function as(browser: Browser, user: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await signIn(page, user)
  return page
}

test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/v1/auth/login', { data: { username: 'owner', password: PASSWORD, device_label: 'e2e' } })
  ownerToken = ((await login.json()) as { access_token: string }).access_token
  const table = (await api(request, 'POST', '/tables', { name: tableName, capacity: 4 })) as { id: number }
  tableId = table.id
  const menu = (await api(request, 'GET', '/menu')) as { items: { name: string; is_available: boolean }[] }
  const item = menu.items.find((i) => i.is_available)
  if (!item) throw new Error('demo menu has no available item')
  itemName = item.name
})

test.afterAll(async ({ request }) => {
  if (tableId) await api(request, 'DELETE', `/tables/${tableId}`)
})

test('seat → order → kitchen → serve → bill → pay → table released', async ({ browser, request }) => {
  test.setTimeout(120_000)

  // Server seats the table and sends one item to the kitchen.
  const server = await as(browser, 'server')
  await server.goto('/floor')
  await server.getByRole('button', { name: new RegExp(`^Table ${tableName}, 4 seats`) }).click()
  await server.getByRole('button', { name: /^Open table/ }).click()
  await expect(server).toHaveURL(/\/orders\/\d+$/)
  const orderUrl = server.url()
  await server.getByLabel('Search the menu').fill(itemName)
  await server.getByRole('button', { name: new RegExp(`^Add one ${escape(itemName)}`) }).first().click()
  await server.getByRole('button', { name: /^Add & send/ }).click()
  await expect(server.getByRole('region', { name: 'In the kitchen' })).toContainText(itemName)

  // The kitchen starts and finishes the ticket.
  const chef = await as(browser, 'chef')
  await chef.goto('/kitchen')
  await chef.getByRole('button', { name: new RegExp(`^Start — ${tableName},`) }).click()
  await chef.getByRole('button', { name: new RegExp(`^Ready — ${tableName},`) }).click()
  await expect(chef.getByRole('button', { name: new RegExp(`^Served — ${tableName},`) })).toBeVisible()

  // The server sees it ready (polling) and serves it.
  await server.goto(orderUrl)
  await expect(server.getByRole('region', { name: 'Ready to serve' })).toContainText(itemName, { timeout: 15_000 })
  await server.getByRole('button', { name: `Serve ${itemName}` }).click()
  await expect(server.getByRole('region', { name: 'Served' })).toContainText(itemName)

  // The cashier issues the bill and takes a cash payment for the full balance.
  const cashier = await as(browser, 'cashier')
  await cashier.goto(orderUrl)
  await cashier.getByRole('button', { name: /^Issue bill/ }).click()
  await expect(cashier).toHaveURL(/\/bills\/\d+$/)
  await cashier.getByRole('button', { name: 'Take payment' }).click()
  await cashier.getByRole('button', { name: /^Charge / }).click()
  await expect(cashier.getByRole('heading', { name: 'Paid in full' })).toBeVisible()

  // The table no longer has an order; the floor shows it free (or being cleaned).
  const floor = (await api(request, 'GET', '/tables')) as { tables: { id: number; status: string; active_order: unknown }[] }
  const table = floor.tables.find((t) => t.id === tableId)
  expect(table?.active_order).toBeNull()
  expect(['AVAILABLE', 'CLEANING']).toContain(table?.status)
  await server.goto('/floor')
  await expect(server.getByRole('button', { name: new RegExp(`^Table ${tableName}, 4 seats, (Available|Cleaning)`) })).toBeVisible()
})

test('a role without billing access is refused by the server, not just hidden', async ({ browser }) => {
  const chef = await as(browser, 'chef')
  await chef.goto('/bills')
  await expect(chef.getByText('Not available to you')).toBeVisible()
  const status = await chef.evaluate(async () => {
    const r = await fetch('/api/v1/auth/web/refresh', { method: 'POST', headers: { 'X-Bistro-Client': 'web', 'Content-Type': 'application/json' }, body: '{}' })
    const { access_token } = (await r.json()) as { access_token: string }
    return (await fetch('/api/v1/bills', { headers: { Authorization: `Bearer ${access_token}` } })).status
  })
  expect(status).toBe(403)
})

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
