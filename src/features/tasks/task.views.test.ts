import { describe, it, expect } from 'vitest'
import {
  activeView,
  inboxCount,
  listCounts,
  todayCount,
  viewTitle,
} from './task.views'
import type { Task } from './task.types'
import type { List } from '~/features/lists/list.types'

/* Ids look like the real thing -- hex ObjectIds -- because that is what the
   URL, the cache and the schema all carry now (PLAN.md D14). */
const list = (id: string, name: string): List => ({
  id,
  name,
  createdAt: '2026-09-01T00:00:00.000Z',
})
const SHIP = list('64b0c0ffee0ddba11ad00001', 'Ship v1')
const DOCS = list('64b0c0ffee0ddba11ad00002', 'Docs')
const INFRA = list('64b0c0ffee0ddba11ad00003', 'Infra')
const POLISH = list('64b0c0ffee0ddba11ad00004', 'Polish')
const lists = [SHIP, DOCS, INFRA, POLISH]

const now = new Date('2026-09-15T12:00:00.000Z')
const at = (iso: string) => iso

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: over.id,
    notes: null,
    status: 'todo',
    dueAt: null,
    priority: 'p2',
    listId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

const tasks: Task[] = [
  task({ id: 'a', dueAt: at('2026-09-15T09:00:00.000Z'), listId: DOCS.id }),
  task({ id: 'b', dueAt: at('2026-09-15T18:00:00.000Z'), status: 'doing' }),
  task({ id: 'c', dueAt: at('2026-09-15T08:00:00.000Z'), status: 'done' }),
  task({ id: 'd', dueAt: at('2026-09-20T08:00:00.000Z'), listId: DOCS.id }),
  task({ id: 'e', listId: INFRA.id, status: 'done' }),
]

describe('activeView', () => {
  it('reads the URL as a view name', () => {
    expect(activeView({})).toEqual({ kind: 'inbox' })
    expect(activeView({ due: 'today' })).toEqual({ kind: 'today' })
    expect(activeView({ list: DOCS.id })).toEqual({ kind: 'list', id: DOCS.id })
    expect(activeView({ due: 'week' })).toEqual({ kind: 'other' })
  })

  it('a filter on top of a view is still that view', () => {
    expect(activeView({ due: 'today', status: 'doing', q: 'x' })).toEqual({
      kind: 'today',
    })
    expect(activeView({ status: 'todo', sort: 'created' })).toEqual({
      kind: 'inbox',
    })
  })

  it('a list wins over a due filter, since the sidebar lists lists', () => {
    expect(activeView({ list: INFRA.id, due: 'today' })).toEqual({
      kind: 'list',
      id: INFRA.id,
    })
  })
})

describe('viewTitle', () => {
  it('names the view in the sidebar’s words', () => {
    expect(viewTitle({})).toBe('Inbox')
    expect(viewTitle({ due: 'today' })).toBe('Today')
    expect(viewTitle({ list: POLISH.id }, lists)).toBe('Polish')
    // A list that no longer exists reads as Inbox, not as a blank title.
    expect(viewTitle({ list: '64b0c0ffee0ddba11ad0dead' }, lists)).toBe('Inbox')
    expect(viewTitle({ due: 'overdue' })).toBe('Overdue')
    expect(viewTitle({ due: 'week' })).toBe('This week')
    expect(viewTitle({ due: 'none' })).toBe('No date')
  })
})

describe('counts', () => {
  it('count open tasks only -- a badge is what is left, not what exists', () => {
    expect(inboxCount(tasks)).toBe(3)
    expect(todayCount(tasks, now)).toBe(2)
    expect(listCounts(tasks, lists)).toEqual({
      [SHIP.id]: 0,
      [DOCS.id]: 2,
      [INFRA.id]: 0,
      [POLISH.id]: 0,
    })
  })

  it('an empty list counts to zero everywhere, never undefined', () => {
    expect(inboxCount([])).toBe(0)
    expect(todayCount([], now)).toBe(0)
    expect(Object.values(listCounts([], lists))).toEqual([0, 0, 0, 0])
    // No lists at all: an empty record, not a crash.
    expect(listCounts(tasks, [])).toEqual({})
  })
})
