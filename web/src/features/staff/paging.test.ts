import { clampOffset } from './paging'

describe('clampOffset', () => {
  it('leaves a page with rows alone', () => {
    expect(clampOffset(0, 0, 25)).toBeNull()
    expect(clampOffset(0, 60, 25)).toBeNull()
    expect(clampOffset(25, 26, 25)).toBeNull()
  })

  it('steps back to the last page when the last row of the last page went away', () => {
    // 26 people, page 2 held one; after deactivating them (hidden filter) there are 25.
    expect(clampOffset(25, 25, 25)).toBe(0)
    expect(clampOffset(50, 51, 25)).toBeNull()
    expect(clampOffset(75, 51, 25)).toBe(50)
    expect(clampOffset(50, 50, 25)).toBe(25)
  })

  it('goes to the first page when nobody is left', () => {
    expect(clampOffset(25, 0, 25)).toBe(0)
  })
})
