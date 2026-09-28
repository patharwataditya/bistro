import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { PASSWORD, signIn } from './helpers'

/**
 * The order screen on a bad network: a lost "Add & send" answer retried with the same
 * intent, and a slow quantity save answered after the check was sent to the kitchen.
 * Runs against the real API on a throwaway table (and order) removed afterwards.
 */

const tableName = `E2R${Date.now().toString(36).slice(-6).toUpperCase()}`
let ownerToken = ''
let tableId = 0
let orderId = 0
let dishA = { id: 0, name: '' }
let dishB = { id: 0, name: '' }

interface Item { name: string; quantity: number; status: string }
interface OrderDto { id: number; status: string; version: number; items: Item[] }

async function api<T>(request: APIRequestContext, method: string, path: string, data?: unknown, key?: string): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${ownerToken}` }
  if (key) headers['Idempotency-Key'] = key
  const res = await request.fetch(`/api/v1${path}`, { method, data, headers })
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy()
  return (res.status() === 204 ? null : await res.json()) as T
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const lines = (o: OrderDto) => o.items.map((i) => `${i.quantity}x${i.name}:${i.status}`).sort()

test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/v1/auth/login', { data: { username: 'owner', password: PASSWORD, device_label: 'e2e' } })
  ownerToken = ((await login.json()) as { access_token: string }).access_token
  const menu = await api<{ items: { id: number; name: string; is_available: boolean }[] }>(request, 'GET', '/menu')
  const available = menu.items.filter((i) => i.is_available)
  const [a, b] = available
  if (!a || !b) throw new Error('demo menu needs two available items')
  dishA = a
  dishB = b
  tableId = (await api<{ id: number }>(request, 'POST', '/tables', { name: tableName, capacity: 4 })).id
})

test.beforeEach(async ({ request }) => {
  const order = await api<OrderDto>(request, 'POST', '/orders', { table_id: tableId, guest_count: 2, items: [{ menu_item_id: dishA.id, quantity: 2 }] }, crypto.randomUUID())
  orderId = order.id
})

test.afterEach(async ({ request }) => {
  if (!orderId) return
  const o = await api<OrderDto>(request, 'GET', `/orders/${orderId}`)
  if (o.status === 'OPEN') await api(request, 'POST', `/orders/${orderId}/cancel`, { version: o.version, reason: 'e2e cleanup' })
  orderId = 0
})

test.afterAll(async ({ request }) => {
  if (tableId) await api(request, 'DELETE', `/tables/${tableId}`)
})

async function openOrder(page: Page) {
  await signIn(page, 'manager')
  await page.goto(`/orders/${orderId}`)
  await expect(page.getByRole('region', { name: 'Not sent yet' })).toContainText(dishA.name)
}

test('a lost "Add & send" answer is retried as the same intent: added and sent once', async ({ page, request }) => {
  await openOrder(page)
  await page.getByLabel('Search the menu').fill(dishB.name)
  await page.getByRole('button', { name: new RegExp(`^Add one ${escape(dishB.name)}`) }).first().click()

  const keys: string[] = []
  await page.route(`**/api/v1/orders/${orderId}/items`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    keys.push(route.request().headers()['idempotency-key'] ?? '')
    if (keys.length === 1) {
      await route.fetch() // the server does it…
      return route.abort('failed') // …but the answer never arrives
    }
    return route.continue()
  })

  await page.getByRole('button', { name: /^Add & send/ }).click()
  await expect.poll(() => keys.length).toBe(1)
  // Nothing is lost: the new item is still there to try again.
  await expect(page.getByRole('button', { name: /^Add & send/ })).toBeEnabled()
  await expect(page.locator('#new-items-h')).toContainText('1')
  await page.getByRole('button', { name: /^Add & send/ }).click()
  await expect(page.getByRole('region', { name: 'In the kitchen' })).toContainText(dishB.name)

  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  const o = await api<OrderDto>(request, 'GET', `/orders/${orderId}`)
  expect(lines(o)).toEqual([`1x${dishB.name}:SENT`, `2x${dishA.name}:SENT`].sort())
})

test('a slow quantity save answered after the send never rolls the check back', async ({ page, request }) => {
  await openOrder(page)
  const patches: string[] = []
  await page.route(`**/api/v1/orders/${orderId}/items/*`, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    patches.push(route.request().postData() ?? '')
    const response = await route.fetch()
    if (patches.length === 1) await new Promise((r) => setTimeout(r, 2500))
    return route.fulfill({ response })
  })

  await page.getByRole('button', { name: `Increase ${dishA.name}` }).click()
  await page.waitForTimeout(600) // the debounced save is now in flight
  await page.getByRole('button', { name: /^Send to kitchen/ }).click()

  const kitchen = page.getByRole('region', { name: 'In the kitchen' })
  await expect(kitchen).toContainText(`3×${dishA.name}`, { timeout: 10_000 })
  // Well after the slow answer: still in the kitchen, nothing "not sent" came back.
  await page.waitForTimeout(3000)
  await expect(kitchen).toContainText(`3×${dishA.name}`)
  await expect(page.getByRole('region', { name: 'Not sent yet' })).toHaveCount(0)
  expect(patches).toEqual(['{"quantity":3}'])

  const o = await api<OrderDto>(request, 'GET', `/orders/${orderId}`)
  expect(lines(o)).toEqual([`3x${dishA.name}:SENT`])
})
