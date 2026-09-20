import { describe, it, expect } from 'vitest'
import { fuzzyFilter, fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('returns 0 for an empty query, so everything matches equally', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
    expect(fuzzyScore('   ', 'anything')).toBe(0)
  })

  it('returns null when a character cannot be found in order', () => {
    expect(fuzzyScore('xyz', 'focus the search')).toBeNull()
    expect(fuzzyScore('hcraes', 'search')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('FOCUS', 'focus the search')).not.toBeNull()
  })

  it('ranks a whole contiguous hit above a scattered subsequence', () => {
    const whole = fuzzyScore('del', 'Delete task')!
    const scattered = fuzzyScore('del', 'Duplicate the entire list')!
    expect(whole).toBeGreaterThan(scattered)
  })

  it('prefers a hit at the start of a word', () => {
    const wordStart = fuzzyScore('sea', 'Focus the search')!
    // 'sea' inside a word, contiguously. ('Release notes' has no 'sea' in
    // order at all -- the fixture this test shipped with, which never ran.)
    const midWord = fuzzyScore('sea', 'Undersea cables')!
    expect(wordStart).toBeGreaterThan(midWord)
  })

  it('prefers a hit at the very start', () => {
    expect(fuzzyScore('new', 'New task')!).toBeGreaterThan(
      fuzzyScore('new', 'Add a new task')!,
    )
  })
})

describe('fuzzyFilter', () => {
  const items = [
    'Delete task',
    'Duplicate task',
    'New task',
    'Show all statuses',
  ]

  it('drops non-matches and sorts the rest best first', () => {
    expect(fuzzyFilter('del', items, (s) => s)).toEqual(['Delete task'])
    expect(fuzzyFilter('task', items, (s) => s)).toEqual([
      'New task',
      'Delete task',
      'Duplicate task',
    ])
  })

  it('keeps the input order for ties', () => {
    expect(fuzzyFilter('', items, (s) => s)).toEqual(items)
  })
})
