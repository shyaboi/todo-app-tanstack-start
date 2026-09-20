import { describe, it, expect } from 'vitest'
import {
  joinStatus,
  parseTaskSearch,
  splitStatus,
  toFilters,
} from './task.search-params'

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
      status: 'todo,doing',
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
      status: 'todo,done',
    })
  })

  it('drops the status key entirely when nothing valid remains', () => {
    expect(parseTaskSearch({ status: 'archived' })).toEqual({})
    expect(parseTaskSearch({ status: '' })).toEqual({})
  })

  it('deduplicates repeated statuses', () => {
    expect(parseTaskSearch({ status: 'todo,todo,doing' })).toEqual({
      status: 'todo,doing',
    })
  })

  it('tolerates whitespace around comma-separated values', () => {
    expect(parseTaskSearch({ status: ' todo , doing ' })).toEqual({
      status: 'todo,doing',
    })
  })

  it('accepts the array form a value written from code arrives as', () => {
    // The router JSON-parses search values, so an array can reach the parser.
    expect(parseTaskSearch({ status: ['todo', 'nope', 'done'] })).toEqual({
      status: 'todo,done',
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

  it('survives several bad parameters at once and keeps the good one', () => {
    // The exact link the E2E suite throws at the page.
    expect(
      parseTaskSearch({
        status: 'archived',
        due: 'someday',
        sort: 'alphabetical',
        q: 'focus',
      }),
    ).toEqual({ q: 'focus' })
  })

  it('treats due=any as no filter, so it never appears in the URL', () => {
    expect(parseTaskSearch({ due: 'any' })).toEqual({})
  })

  it('trims the query and drops it when empty', () => {
    expect(parseTaskSearch({ q: '  focus  ' })).toEqual({ q: 'focus' })
    expect(parseTaskSearch({ q: '   ' })).toEqual({})
    expect(parseTaskSearch({ q: '' })).toEqual({})
  })

  it('keeps a query that happens to look like a number or a boolean', () => {
    // The router parses `?q=123` to the number 123; the search must survive.
    expect(parseTaskSearch({ q: 123 })).toEqual({ q: '123' })
    expect(parseTaskSearch({ q: true })).toEqual({ q: 'true' })
  })

  it('caps an absurdly long query rather than handing it to a regex', () => {
    // Over the limit falls back to no query at all.
    expect(parseTaskSearch({ q: 'a'.repeat(5000) })).toEqual({})
  })

  it('ignores an object where a string belongs', () => {
    // Exactly the shape an operator injection would have to take.
    expect(parseTaskSearch({ q: { $ne: null } })).toEqual({})
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
      null,
      'not even an object',
      42,
    ]) {
      expect(() => parseTaskSearch(raw)).not.toThrow()
    }
  })

  it('ignores keys it does not know about', () => {
    expect(parseTaskSearch({ q: 'focus', page: '2', utm_source: 'x' })).toEqual(
      {
        q: 'focus',
      },
    )
  })

  it('accepts a list id and falls back on anything that is not one', () => {
    // Lists are the owner's own now (PLAN.md D14), so the URL carries an id
    // rather than a name from a fixed vocabulary.
    const id = '64b0c0ffee0ddba11ad00002'
    expect(parseTaskSearch({ list: id })).toEqual({ list: id })
    expect(parseTaskSearch({ list: 'docs', q: 'keep' })).toEqual({ q: 'keep' })
  })
})

describe('splitStatus / joinStatus', () => {
  it('round-trip', () => {
    expect(splitStatus(joinStatus(['doing', 'todo']))).toEqual([
      'doing',
      'todo',
    ])
  })

  it('an empty selection joins to undefined, so the key leaves the URL', () => {
    expect(joinStatus([])).toBeUndefined()
    expect(splitStatus(undefined)).toEqual([])
  })

  it('deduplicates in both directions', () => {
    expect(joinStatus(['todo', 'todo'])).toBe('todo')
    expect(splitStatus('todo,todo')).toEqual(['todo'])
  })
})

describe('toFilters', () => {
  it('derives the status array the filter functions expect', () => {
    expect(
      toFilters({ q: 'focus', status: 'todo,doing', due: 'week' }),
    ).toEqual({
      q: 'focus',
      status: ['todo', 'doing'],
      due: 'week',
      sort: undefined,
      list: undefined,
    })
  })

  it('gives an empty status array for no status, which the filters read as no filter', () => {
    expect(toFilters({}).status).toEqual([])
  })
})
