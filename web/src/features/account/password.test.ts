import { describe, expect, it } from 'vitest'
import { isStrongPassword, passwordErrors } from './password'

describe('isStrongPassword', () => {
  it('needs 8+ characters mixing letters with numbers or symbols', () => {
    expect(isStrongPassword('bistro-1')).toBe(true)
    expect(isStrongPassword('abc12345')).toBe(true)
    expect(isStrongPassword('pässwört!')).toBe(true)
    expect(isStrongPassword('abcdefgh')).toBe(false) // letters only
    expect(isStrongPassword('12345678')).toBe(false) // digits only
    expect(isStrongPassword('!!!!1111')).toBe(false) // no letters
    expect(isStrongPassword('abc123')).toBe(false) // too short
  })
})

describe('passwordErrors', () => {
  const ok = { current: 'old', next: 'bistro-demo-2', confirm: 'bistro-demo-2' }
  it('is clean for a valid form', () => expect(passwordErrors(ok, true)).toEqual({}))
  it('flags weak and mismatched passwords while typing', () => {
    expect(passwordErrors({ ...ok, next: 'short', confirm: 'short' }, false).next).toBe('Too weak')
    expect(passwordErrors({ ...ok, confirm: 'bistro-demo-3' }, false).confirm).toBe("Doesn't match")
  })
  it('flags surrounding spaces', () => {
    expect(passwordErrors({ ...ok, next: ' bistro-demo-2', confirm: ' bistro-demo-2' }, false).next).toBe('Remove spaces at the start or end')
  })
  it('only flags empty fields on submit', () => {
    const empty = { current: '', next: '', confirm: '' }
    expect(passwordErrors(empty, false)).toEqual({})
    expect(Object.keys(passwordErrors(empty, true)).sort()).toEqual(['confirm', 'current', 'next'])
  })
})
