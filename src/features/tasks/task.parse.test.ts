import { describe, it, expect } from 'vitest'
import { parseComposer } from './task.parse'

/* A Tuesday at 10:00 local, so "tomorrow", "Friday" and "next week" all have
   one right answer. */
const now = new Date(2026, 8, 15, 10, 0, 0)

const local = (iso: string | null) => (iso ? new Date(iso) : null)

describe('parseComposer', () => {
  it('a plain title is a plain title', () => {
    const p = parseComposer('Write the README', now)
    expect(p).toEqual({
      title: 'Write the README',
      listId: null,
      priority: null,
      status: null,
      dueAt: null,
      tokens: [],
    })
  })

  it('reads #list by id or by name, case-insensitively', () => {
    expect(parseComposer('Ship it #ship-v1', now).listId).toBe('ship-v1')
    expect(parseComposer('Ship it #Docs', now).listId).toBe('docs')
    expect(parseComposer('#INFRA Ship it', now)).toMatchObject({
      listId: 'infra',
      title: 'Ship it',
    })
  })

  it('leaves an unknown #tag in the title -- lists are a fixed vocabulary', () => {
    const p = parseComposer('Fix #flaky test', now)
    expect(p.listId).toBeNull()
    expect(p.title).toBe('Fix #flaky test')
    expect(p.tokens).toEqual([])
  })

  it('does not read a sigil glued to a word', () => {
    expect(parseComposer('Close issue#42 !p1', now).title).toBe(
      'Close issue#42',
    )
    expect(parseComposer('email me@example.com', now).title).toBe(
      'email me@example.com',
    )
  })

  it('reads !priority as p1..p3 or 1..3', () => {
    expect(parseComposer('Urgent !p1', now).priority).toBe('p1')
    expect(parseComposer('Meh !3', now).priority).toBe('p3')
    expect(parseComposer('Nope !p9', now)).toMatchObject({
      priority: null,
      title: 'Nope !p9',
    })
  })

  it('reads ~status in the wire vocabulary only', () => {
    expect(parseComposer('Already on it ~doing', now).status).toBe('doing')
    expect(parseComposer('Was it ~in-progress', now)).toMatchObject({
      status: null,
      title: 'Was it ~in-progress',
    })
  })

  it('takes the first of a kind and leaves a second one in the title', () => {
    const p = parseComposer('#docs then #infra', now)
    expect(p.listId).toBe('docs')
    expect(p.title).toBe('then #infra')
  })

  it('resolves a plain-English date to an exact local instant', () => {
    const p = parseComposer('Call the bank tomorrow 4pm', now)
    expect(p.title).toBe('Call the bank')
    const d = local(p.dueAt)!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 16])
    expect([d.getHours(), d.getMinutes()]).toEqual([16, 0])
    expect(p.tokens).toEqual([
      { kind: 'date', raw: 'tomorrow 4pm', dueAt: p.dueAt },
    ])
  })

  it('weekdays go forward, never back', () => {
    const p = parseComposer('Review on Friday', now)
    const d = local(p.dueAt)!
    expect(d.getDay()).toBe(5)
    expect(d.getTime()).toBeGreaterThan(now.getTime())
    // The preposition that only introduced the date goes with it.
    expect(p.title).toBe('Review')
  })

  it('a bare month name is a word, not a date', () => {
    const p = parseComposer('Fix May bug', now)
    expect(p.dueAt).toBeNull()
    expect(p.title).toBe('Fix May bug')
  })

  it('a numeric date is a date', () => {
    const p = parseComposer('Taxes by 4 March', now)
    expect(local(p.dueAt)?.getMonth()).toBe(2)
    expect(p.title).toBe('Taxes')
  })

  it('all four together, in any order', () => {
    const p = parseComposer(
      '!p1 Draft the launch post ~doing #docs next monday 9am',
      now,
    )
    expect(p).toMatchObject({
      title: 'Draft the launch post',
      listId: 'docs',
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
    expect(parseComposer('#docs !p1', now).title).toBe('')
  })
})
