import { describe, it, expect } from 'vitest'
import { escapeRegex } from './task.service'

/* Search text becomes a RegExp, so an unescaped metacharacter would let a
   query match far more than the user typed -- and `.*` would return the whole
   collection. Asserted behaviourally rather than against an expected escaped
   string, because the behaviour is what matters. */
describe('escapeRegex', () => {
  it.each([
    ['.*', 'a.*b'],
    ['a|b', 'x a|b y'],
    ['(x)', 'has (x) inside'],
    ['c++', 'c++ lang'],
    ['[a-z]', 'the [a-z] class'],
    ['$100', 'costs $100'],
  ])('treats %j as literal text', (term, haystack) => {
    const rx = new RegExp(escapeRegex(term), 'i')
    expect(rx.test(haystack)).toBe(true)
  })

  it.each(['.*', '.+', '[a-z]', '(.*)', '^'])(
    'stops %j from matching unrelated text',
    (term) => {
      const rx = new RegExp(escapeRegex(term), 'i')
      // The crucial case: a wildcard must not turn into "match everything".
      expect(rx.test('unrelated content')).toBe(false)
    },
  )

  it('leaves ordinary search terms untouched', () => {
    expect(escapeRegex('optimistic')).toBe('optimistic')
    expect(escapeRegex('focus trap')).toBe('focus trap')
  })
})
