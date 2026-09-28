import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromResponse } from '@/api/errors'
import type { Me } from '@/api/types'
import { ToastProvider } from '@/ui/Toast'
import AccountPage from './AccountPage'

// A plain async function rather than vi.fn(): Vitest reports a vi.fn()'s rejected result as a
// test failure even when the component handles it.
const mocks = vi.hoisted(() => ({ calls: [] as [string, string][], fail: null as Error | null }))

vi.mock('@/api/client', () => ({ request: vi.fn(), authRequest: vi.fn() }))
vi.mock('@/auth/session', () => {
  const me: Me = {
    id: 1, username: 'owner', full_name: 'Olivia Owner', roles: [], permissions: [], restaurant_name: 'Bistro',
    location: { id: 1, name: 'Main', timezone: 'UTC', currency_code: 'INR' },
  }
  return {
    useMe: () => ({ me, can: () => false, grants: { can: () => false, any: () => false } }),
    useSession: () => ({
      changePassword: async (current: string, next: string) => {
        mocks.calls.push([current, next])
        if (mocks.fail) throw mocks.fail
      },
      signOut: vi.fn(),
      signOutEverywhere: vi.fn(),
    }),
  }
})

/** The server's validation envelope, mapped exactly as the API client maps it. */
const validation = (fields: { field: string; message: string }[], message = 'Some fields need attention.') =>
  fromResponse(422, { error: { code: 'VALIDATION_ERROR', message, details: { fields } } })

async function submit(current: string, next: string) {
  render(<ToastProvider><AccountPage /></ToastProvider>)
  await userEvent.type(screen.getByLabelText('Current password'), current)
  await userEvent.type(screen.getByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Confirm new password'), next)
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

beforeEach(() => {
  mocks.calls = []
  mocks.fail = null
})

describe('AccountPage — change password', () => {
  it('shows server field errors on the matching fields', async () => {
    mocks.fail = validation([
      { field: 'current_password', message: 'Current password is incorrect' },
      { field: 'new_password', message: 'Choose a password you have not used before' },
    ])
    await submit('wrong-password-1', 'brand-new-pass-9')
    expect(mocks.calls).toEqual([['wrong-password-1', 'brand-new-pass-9']])
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.getByText('Choose a password you have not used before')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Some fields need attention.')).toBeNull()
  })

  it('shows an error without field details as a form message', async () => {
    mocks.fail = fromResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a minute.' } })
    await submit('current-pass-1', 'brand-new-pass-9')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Wait a minute.')
  })
})
