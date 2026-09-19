import { describe, it, expect } from 'vitest'
import {
  patchTask,
  removeTask,
  replaceTask,
  insertTaskAt,
  indexOfTask,
} from './task.cache'
import type { Task } from './task.types'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `task ${id}`,
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

const list = () => [task('a'), task('b'), task('c')]

describe('patchTask', () => {
  it('changes only the target task', () => {
    const next = patchTask(list(), 'b', { status: 'done' })
    expect(next.map((t) => t.status)).toEqual(['todo', 'done', 'todo'])
  })

  it('does not mutate the array it was given', () => {
    const before = list()
    const snapshot = structuredClone(before)
    patchTask(before, 'b', { status: 'done' })
    // The rollback path depends on the snapshot still being pristine.
    expect(before).toEqual(snapshot)
  })

  it('preserves order', () => {
    expect(
      patchTask(list(), 'a', { title: 'renamed' }).map((t) => t.id),
    ).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op for an unknown id', () => {
    expect(patchTask(list(), 'zzz', { status: 'done' })).toEqual(list())
  })
})

describe('removeTask / insertTaskAt', () => {
  it('restores a removed task to its original position', () => {
    const before = list()
    const index = indexOfTask(before, 'b')
    const removed = removeTask(before, 'b')

    expect(removed.map((t) => t.id)).toEqual(['a', 'c'])
    // The property an undo depends on: round-tripping is identity.
    expect(insertTaskAt(removed, task('b'), index)).toEqual(before)
  })

  it.each([
    ['a', 0],
    ['b', 1],
    ['c', 2],
  ])('round-trips %s at index %i', (id, index) => {
    const before = list()
    expect(indexOfTask(before, id)).toBe(index)
    const after = insertTaskAt(removeTask(before, id), task(id), index)
    expect(after).toEqual(before)
  })

  it('clamps an out-of-range index instead of leaving a hole', () => {
    expect(insertTaskAt([task('a')], task('z'), 99).map((t) => t.id)).toEqual([
      'a',
      'z',
    ])
    expect(insertTaskAt([task('a')], task('z'), -5).map((t) => t.id)).toEqual([
      'z',
      'a',
    ])
  })
})

describe('replaceTask', () => {
  it('swaps a task in place, keeping its position', () => {
    const next = replaceTask(list(), task('b', { title: 'server version' }))
    expect(next.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(next[1]!.title).toBe('server version')
  })
})
