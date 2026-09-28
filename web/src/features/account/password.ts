/**
 * The new-password rule, shown before the server is asked: at least 8 characters, mixing
 * letters with numbers or symbols (Android's ChangePasswordSheet). The server stays the
 * authority and adds its own checks (e.g. no leading or trailing spaces).
 */
export const PASSWORD_HINT = 'At least 8 characters, mixing letters with numbers or symbols'

export function isStrongPassword(value: string): boolean {
  const chars = [...value]
  return chars.length >= 8 && chars.some(isLetter) && chars.some((c) => !isLetter(c))
}

function isLetter(c: string): boolean {
  return /\p{L}/u.test(c)
}

export interface PasswordForm {
  current: string
  next: string
  confirm: string
}

export interface PasswordErrors {
  current?: string
  next?: string
  confirm?: string
}

/** Field errors for the form as typed. Empty fields are only flagged on submit. */
export function passwordErrors(f: PasswordForm, submitted: boolean): PasswordErrors {
  const e: PasswordErrors = {}
  if (submitted && !f.current) e.current = 'Enter your current password'
  if (f.next && !isStrongPassword(f.next)) e.next = 'Too weak'
  else if (f.next && f.next.trim() !== f.next) e.next = 'Remove spaces at the start or end'
  else if (submitted && !f.next) e.next = 'Too weak'
  if (f.confirm && f.confirm !== f.next) e.confirm = "Doesn't match"
  else if (submitted && !f.confirm) e.confirm = "Doesn't match"
  return e
}
