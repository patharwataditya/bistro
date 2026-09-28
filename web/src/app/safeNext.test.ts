import { safeNext } from './safeNext'

describe('safeNext', () => {
  it.each(['/floor', '/orders/12?tab=x', '/bills/3#top'])('keeps in-app path %s', (p) => {
    expect(safeNext(p)).toBe(p)
  })
  it.each([
    null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\\/evil.example',
    '/\t/evil.example', '/\n/evil.example', 'javascript:alert(1)', 'floor',
  ])('refuses %j', (p) => {
    expect(safeNext(p)).toBeNull()
  })
  it('refuses dot segments that normalise to another host', () => {
    expect(safeNext('/.//evil.example')).toBeNull()
    expect(safeNext('/a/..//evil.example')).toBeNull()
    expect(safeNext('/orders/./12')).toBe('/orders/12')
  })
})
