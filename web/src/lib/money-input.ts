/** What a person typed into an amount field: digits and at most two decimals. */
const PATTERN = /^\d{0,10}([.,]\d{0,2})?$/

export function acceptMoney(text: string): boolean {
  return text === '' || PATTERN.test(text)
}

/** Normalised decimal string ("12.50") or null. Comma decimals are accepted. */
export function parseMoney(text: string): string | null {
  const t = text.replace(',', '.').trim()
  if (!t || t === '.' || !/^\d{1,10}(\.\d{0,2})?$/.test(t)) return null
  const [i = '0', f = ''] = t.split('.')
  return `${String(Number(i))}.${f.padEnd(2, '0')}`
}
