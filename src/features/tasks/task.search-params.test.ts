import { describe, it, expect } from 'vitest'
import { parseTaskSearch, toFilters } from './task.search-params'

/* Everything here arrives from a URL, which anyone can type. The contract is
   that a bad link shows the unfiltered list rather than an error page: every
   case below asserts a fallback, never a throw. */

describe('parseTaskSearch', () => {
  it('parses the URL the design shows as its example', () => {
    // /?q=focus&status=todo,doing&due=week&sort=relevance
    expect(
      parseTaskSearch({
        q: 'focus',
        status: 'todo,doing',
        due: 'week',
        sort: 'relevance',
      }),
    ).toEqual({
      q: 'focus',
      status: ['todo', 'doing'],
      due: 'week',
      sort: 'relevance',
    })
  })

  it('returns an empty object for no parameters', () => {
    expect(parseTaskSearch({})).toEqual({})
  })

  it('drops an unknown status value but keeps the valid ones', () => {
    // One bad token must not discard the whole filter.
    expect(parseTaskSearch({ status: 'todo,archived,done' })).toEqual({
      status: ['todo', 'done'],
    })
  })

  it('drops the status key entirely when nothing valid remains', () => {
    expect(parseTaskSearch({ status: 'archived' })).toEqual({})
    expect(parseTaskSearch({ status: '' })).toEqual({})
  })

  it('deduplicates repeated statuses', () => {
    expect(parseTaskSearch({ status: 'todo,todo,doing' })).toEqual({
      status: ['todo', 'doing'],
    })
  })

  it('tolerates whitespace around comma-separated values', () => {
    expect(parseTaskSearch({ status: ' todo , doing ' })).toEqual({
      status: ['todo', 'doing'],
    })
  })

  it('falls back on an unknown due value instead of failing the navigation', () => {
    expect(parseTaskSearch({ due: 'someday', q: 'keep me' })).toEqual({
      q: 'keep me',
    })
  })

  it('falls back on an unknown sort value', () => {
    expect(parseTaskSearch({ sort: 'alphabetical' })).toEqual({})
  })

  it('treats due=any as no filter, so it never appears in the URL', () => {
    expect(parseTaskSearch({ due: 'any' })).toEqual({})
  })

  it('trims the query and drops it when empty', () => {
    expect(parseTaskSearch({ q: '  focus  ' })).toEqual({ q: 'focus' })
    expect(parseTaskSearch({ q: '   ' })).toEqual({})
    expect(parseTaskSearch({ q: '' })).toEqual({})
  })

  it('caps an absurdly long query rather than handing it to a regex', () => {
    const result = parseTaskSearch({ q: 'a'.repeat(5000) })
    // Over the limit falls back to no query at all.
    expect(result).toEqual({})
  })

  it('ignores parameters that are not strings', () => {
    // Router search can carry parsed JSON; an object where a string belongs is
    // exactly the shape an operator injection would take.
    expect(parseTaskSearch({ q: { $ne: null } })).toEqual({})
    expect(parseTaskSearch({ status: ['todo', 'nope'] })).toEqual({
      status: ['todo'],
    })
    expect(parseTaskSearch({ due: 42 })).toEqual({})
  })

  it('never throws, whatever it is given', () => {
    for (const raw of [
      { q: null },
      { q: undefined },
      { status: null },
      { due: {} },
      { sort: [] },
      { q: 1, status: true, due: Symbol('x'), sort: () => 'due' },
    ]) {
      expect(() =>
        parseTaskSearch(raw as Record<string, unknown>),
      ).not.toThrow()
    }
  })

  it('ignores keys it does not know about', () => {
    expect(parseTaskSearch({ q: 'focus', page: '2', utm_source: 'x' })).toEqual(
      {
        q: 'focus',
      },
    )
  })
})

describe('toFilters', () => {
  it('passes validated search through unchanged', () => {
    const search = {
      q: 'focus',
      status: ['todo' as const],
      due: 'week' as const,
    }
    expect(toFilters(search)).toEqual({
      q: 'focus',
      status: ['todo'],
      due: 'week',
    })
  })
})
