import { describe, it, expect } from 'vitest'
import { parseComposer } from './task.parse'
import type { List } from '~/features/lists/list.types'

const list = (id: string, name: string): List => ({
  id,
  name,
  createdAt: '2026-09-01T00:00:00.000Z',
})
const SHIP = list('64b0c0ffee0ddba11ad00001', 'Ship v1')
const DOCS = list('64b0c0ffee0ddba11ad00002', 'Docs')
const INFRA = list('64b0c0ffee0ddba11ad00003', 'Infra')
const lists = [SHIP, DOCS, INFRA]

/* A Tuesday at 10:00 local, so "tomorrow", "Friday" and "next week" all have
   one right answer. */
const now = new Date(2026, 8, 15, 10, 0, 0)

const local = (iso: string | null) => (iso ? new Date(iso) : null)

describe('parseComposer', () => {
  it('a plain title is a plain title', () => {
    const p = parseComposer('Write the README', now, lists)
    expect(p).toEqual({
      title: 'Write the README',
      listId: null,
      newList: null,
      priority: null,
      status: null,
      dueAt: null,
      tokens: [],
    })
  })

  it('reads #list by id or by name, case-insensitively', () => {
    // Hyphens stand in for spaces, so #ship-v1 reaches "Ship v1".
    expect(parseComposer('Ship it #ship-v1', now, lists).listId).toBe(SHIP.id)
    expect(parseComposer('Ship it #Docs', now, lists).listId).toBe(DOCS.id)
    expect(parseComposer('#INFRA Ship it', now, lists)).toMatchObject({
      listId: INFRA.id,
      title: 'Ship it',
    })
  })

  it('reads an unknown #name as a list to create (D14)', () => {
    const p = parseComposer('Fix #flaky test', now, lists)
    expect(p.listId).toBeNull()
    expect(p.newList).toBe('flaky')
    expect(p.title).toBe('Fix test')
    expect(p.tokens).toEqual([
      { kind: 'new-list', raw: '#flaky', name: 'flaky' },
    ])
  })

  it('with no lists at all, every #name is a new one', () => {
    expect(parseComposer('Ship it #docs', now).newList).toBe('docs')
  })

  it('does not read a sigil glued to a word', () => {
    expect(parseComposer('Close issue#42 !p1', now, lists).title).toBe(
      'Close issue#42',
    )
    expect(parseComposer('email me@example.com', now, lists).title).toBe(
      'email me@example.com',
    )
  })

  it('reads !priority as p1..p3 or 1..3', () => {
    expect(parseComposer('Urgent !p1', now, lists).priority).toBe('p1')
    expect(parseComposer('Meh !3', now, lists).priority).toBe('p3')
    expect(parseComposer('Nope !p9', now, lists)).toMatchObject({
      priority: null,
      title: 'Nope !p9',
    })
  })

  it('reads ~status in the wire vocabulary only', () => {
    expect(parseComposer('Already on it ~doing', now, lists).status).toBe(
      'doing',
    )
    expect(parseComposer('Was it ~in-progress', now, lists)).toMatchObject({
      status: null,
      title: 'Was it ~in-progress',
    })
  })

  it('takes the first of a kind and leaves a second one in the title', () => {
    const p = parseComposer('#docs then #infra', now, lists)
    expect(p.listId).toBe(DOCS.id)
    expect(p.title).toBe('then #infra')
  })

  it('resolves a plain-English date to an exact local instant', () => {
    const p = parseComposer('Call the bank tomorrow 4pm', now, lists)
    expect(p.title).toBe('Call the bank')
    const d = local(p.dueAt)!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 16])
    expect([d.getHours(), d.getMinutes()]).toEqual([16, 0])
    expect(p.tokens).toEqual([
      { kind: 'date', raw: 'tomorrow 4pm', dueAt: p.dueAt },
    ])
  })

  it('weekdays go forward, never back', () => {
    const p = parseComposer('Review on Friday', now, lists)
    const d = local(p.dueAt)!
    expect(d.getDay()).toBe(5)
    expect(d.getTime()).toBeGreaterThan(now.getTime())
    // The preposition that only introduced the date goes with it.
    expect(p.title).toBe('Review')
  })

  it('a bare month name is a word, not a date', () => {
    const p = parseComposer('Fix May bug', now, lists)
    expect(p.dueAt).toBeNull()
    expect(p.title).toBe('Fix May bug')
  })

  it('a numeric date is a date', () => {
    const p = parseComposer('Taxes by 4 March', now, lists)
    expect(local(p.dueAt)?.getMonth()).toBe(2)
    expect(p.title).toBe('Taxes')
  })

  it('all four together, in any order', () => {
    const p = parseComposer(
      '!p1 Draft the launch post ~doing #docs next monday 9am',
      now,
      lists,
    )
    expect(p).toMatchObject({
      title: 'Draft the launch post',
      listId: DOCS.id,
      priority: 'p1',
      status: 'doing',
    })
    const d = local(p.dueAt)!
    expect(d.getDay()).toBe(1)
    expect(d.getHours()).toBe(9)
    expect(p.tokens.map((t) => t.kind)).toEqual([
      'priority',
      'status',
      'list',
      'date',
    ])
  })

  it('tokens alone leave an empty title for the schema to refuse', () => {
    expect(parseComposer('#docs !p1', now, lists).title).toBe('')
  })
})
