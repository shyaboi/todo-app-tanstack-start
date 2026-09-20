import { describe, it, expect } from 'vitest'
import {
  activeView,
  inboxCount,
  listCounts,
  todayCount,
  viewTitle,
} from './task.views'
import type { Task } from './task.types'

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
  task({ id: 'a', dueAt: at('2026-09-15T09:00:00.000Z'), listId: 'docs' }),
  task({ id: 'b', dueAt: at('2026-09-15T18:00:00.000Z'), status: 'doing' }),
  task({ id: 'c', dueAt: at('2026-09-15T08:00:00.000Z'), status: 'done' }),
  task({ id: 'd', dueAt: at('2026-09-20T08:00:00.000Z'), listId: 'docs' }),
  task({ id: 'e', listId: 'infra', status: 'done' }),
]

describe('activeView', () => {
  it('reads the URL as a view name', () => {
    expect(activeView({})).toEqual({ kind: 'inbox' })
    expect(activeView({ due: 'today' })).toEqual({ kind: 'today' })
    expect(activeView({ list: 'docs' })).toEqual({ kind: 'list', id: 'docs' })
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
    expect(activeView({ list: 'infra', due: 'today' })).toEqual({
      kind: 'list',
      id: 'infra',
    })
  })
})

describe('viewTitle', () => {
  it('names the view in the sidebar’s words', () => {
    expect(viewTitle({})).toBe('Inbox')
    expect(viewTitle({ due: 'today' })).toBe('Today')
    expect(viewTitle({ list: 'polish' })).toBe('Polish')
    expect(viewTitle({ due: 'overdue' })).toBe('Overdue')
    expect(viewTitle({ due: 'week' })).toBe('This week')
    expect(viewTitle({ due: 'none' })).toBe('No date')
  })
})

describe('counts', () => {
  it('count open tasks only -- a badge is what is left, not what exists', () => {
    expect(inboxCount(tasks)).toBe(3)
    expect(todayCount(tasks, now)).toBe(2)
    expect(listCounts(tasks)).toEqual({
      'ship-v1': 0,
      docs: 2,
      infra: 0,
      polish: 0,
    })
  })

  it('an empty list counts to zero everywhere, never undefined', () => {
    expect(inboxCount([])).toBe(0)
    expect(todayCount([], now)).toBe(0)
    expect(Object.values(listCounts([]))).toEqual([0, 0, 0, 0])
  })
})
