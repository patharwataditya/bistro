import { expect, type Page } from '@playwright/test'

export const PASSWORD = process.env.BISTRO_PW ?? 'bistro-demo-1'

export async function signIn(page: Page, username: string, path = '/login'): Promise<void> {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account:/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
}
