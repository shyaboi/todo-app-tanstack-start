import { describe, it, expect } from 'vitest'
import {
  countByStatus,
  filterTasks,
  groupByDue,
  hasActiveFilters,
  hiddenByStatus,
  matchesDue,
  matchesQuery,
  sortTasks,
} from './task.filters'
import type { Task, TaskStatus } from './task.types'

/* `now` is fixed and passed in, so every date case is stated rather than
   depending on when the suite runs. A midweek afternoon is deliberate: a Monday
   or a month boundary would hide off-by-one errors that only appear midweek. */
const NOW = new Date('2026-09-19T14:30:00.000Z')

const at = (iso: string) => iso

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: 'a task',
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

describe('matchesQuery', () => {
  const subject = task({
    id: 'a',
    title: 'Wire optimistic updates',
    notes: 'Snapshot the cache before applying',
    listId: 'ship-v1',
  })

  it('matches the title, case-insensitively', () => {
    expect(matchesQuery(subject, 'optimistic')).toBe(true)
    expect(matchesQuery(subject, 'OPTIMISTIC')).toBe(true)
    expect(matchesQuery(subject, 'WiRe')).toBe(true)
  })

  it('matches the notes, which the design says search covers', () => {
    expect(matchesQuery(subject, 'snapshot')).toBe(true)
  })

  it('matches the list name, not the list id', () => {
    // The person sees "Ship v1"; they should be able to search for what they see.
    expect(matchesQuery(subject, 'Ship v1')).toBe(true)
    expect(matchesQuery(subject, 'ship v1')).toBe(true)
  })

  it('does not match unrelated text', () => {
    expect(matchesQuery(subject, 'mongodb')).toBe(false)
  })

  it('treats an empty or whitespace query as no filter', () => {
    expect(matchesQuery(subject, '')).toBe(true)
    expect(matchesQuery(subject, '   ')).toBe(true)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesQuery(subject, '  optimistic  ')).toBe(true)
  })

  it('handles a task with no notes and no list', () => {
    const bare = task({ id: 'b', title: 'bare', notes: null, listId: null })
    expect(matchesQuery(bare, 'bare')).toBe(true)
    expect(matchesQuery(bare, 'anything else')).toBe(false)
  })
})

describe('matchesDue', () => {
  const yesterday = task({ id: 'y', dueAt: at('2026-09-18T17:00:00.000Z') })
  const earlierToday = task({ id: 't1', dueAt: at('2026-09-19T09:00:00.000Z') })
  const laterToday = task({ id: 't2', dueAt: at('2026-09-19T22:00:00.000Z') })
  const inThreeDays = task({ id: 'w', dueAt: at('2026-09-22T17:00:00.000Z') })
  const inAMonth = task({ id: 'l', dueAt: at('2026-10-19T17:00:00.000Z') })
  const undated = task({ id: 'n', dueAt: null })

  it('any matches everything, dated or not', () => {
    for (const t of [yesterday, laterToday, inAMonth, undated]) {
      expect(matchesDue(t, 'any', NOW)).toBe(true)
    }
  })

  it('overdue is strictly before today began', () => {
    expect(matchesDue(yesterday, 'overdue', NOW)).toBe(true)
    // The case that matters: due earlier TODAY is Today, not Overdue. The design
    // shows them as separate groups.
    expect(matchesDue(earlierToday, 'overdue', NOW)).toBe(false)
    expect(matchesDue(laterToday, 'overdue', NOW)).toBe(false)
  })

  it('today covers the whole calendar day, morning and night', () => {
    expect(matchesDue(earlierToday, 'today', NOW)).toBe(true)
    expect(matchesDue(laterToday, 'today', NOW)).toBe(true)
    expect(matchesDue(yesterday, 'today', NOW)).toBe(false)
    expect(matchesDue(inThreeDays, 'today', NOW)).toBe(false)
  })

  it('week includes what is already late, because you are inside the window', () => {
    expect(matchesDue(inThreeDays, 'week', NOW)).toBe(true)
    expect(matchesDue(laterToday, 'week', NOW)).toBe(true)
    expect(matchesDue(yesterday, 'week', NOW)).toBe(true)
    expect(matchesDue(inAMonth, 'week', NOW)).toBe(false)
  })

  it('none matches only undated tasks', () => {
    expect(matchesDue(undated, 'none', NOW)).toBe(true)
    expect(matchesDue(laterToday, 'none', NOW)).toBe(false)
  })

  it('excludes undated tasks from every dated filter', () => {
    for (const due of ['overdue', 'today', 'week'] as const) {
      expect(matchesDue(undated, due, NOW), due).toBe(false)
    }
  })
})

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'a', title: 'alpha', status: 'todo' }),
    task({ id: 'b', title: 'beta', status: 'doing' }),
    task({ id: 'c', title: 'gamma', status: 'done' }),
  ]

  it('returns everything when there are no filters', () => {
    expect(filterTasks(tasks, {}, NOW)).toHaveLength(3)
  })

  it('filters by status', () => {
    expect(
      filterTasks(tasks, { status: ['todo'] }, NOW).map((t) => t.id),
    ).toEqual(['a'])
    expect(
      filterTasks(tasks, { status: ['todo', 'doing'] }, NOW).map((t) => t.id),
    ).toEqual(['a', 'b'])
  })

  it('treats an empty status array as no filter, not as match-nothing', () => {
    // Otherwise unticking the last checkbox would blank the list, which reads
    // as a bug rather than as a cleared filter.
    expect(filterTasks(tasks, { status: [] }, NOW)).toHaveLength(3)
  })

  it('applies query and status together', () => {
    const result = filterTasks(tasks, { q: 'a', status: ['todo'] }, NOW)
    expect(result.map((t) => t.id)).toEqual(['a'])
  })

  it('returns an empty array rather than throwing when nothing matches', () => {
    expect(filterTasks(tasks, { q: 'nothing matches this' }, NOW)).toEqual([])
  })

  it('does not mutate the array it was given', () => {
    const input = [...tasks]
    filterTasks(input, { status: ['todo'] }, NOW)
    expect(input).toHaveLength(3)
  })
})

describe('sortTasks', () => {
  const undated = task({
    id: 'n',
    dueAt: null,
    createdAt: '2026-09-05T00:00:00Z',
  })
  const soon = task({ id: 's', dueAt: at('2026-09-20T09:00:00.000Z') })
  const later = task({ id: 'l', dueAt: at('2026-09-25T09:00:00.000Z') })

  it('sorts by due date, soonest first', () => {
    expect(sortTasks([later, soon], 'due', undefined).map((t) => t.id)).toEqual(
      ['s', 'l'],
    )
  })

  it('puts undated tasks last, because no date is not urgent', () => {
    expect(
      sortTasks([undated, later, soon], 'due', undefined).map((t) => t.id),
    ).toEqual(['s', 'l', 'n'])
  })

  it('defaults to newest created first', () => {
    const old = task({ id: 'old', createdAt: '2026-09-01T00:00:00Z' })
    const recent = task({ id: 'new', createdAt: '2026-09-10T00:00:00Z' })
    expect(
      sortTasks([old, recent], undefined, undefined).map((t) => t.id),
    ).toEqual(['new', 'old'])
  })

  it('is stable when timestamps tie, so the order never flickers', () => {
    const same = '2026-09-01T00:00:00Z'
    const a = task({ id: 'aaa', createdAt: same })
    const b = task({ id: 'bbb', createdAt: same })
    // Seeding and bulk creation produce identical timestamps easily; without a
    // tiebreak the order would be implementation-defined between renders.
    expect(sortTasks([b, a], undefined, undefined).map((t) => t.id)).toEqual([
      'aaa',
      'bbb',
    ])
    expect(sortTasks([a, b], undefined, undefined).map((t) => t.id)).toEqual([
      'aaa',
      'bbb',
    ])
  })

  it('ranks a title match above a notes-only match for relevance', () => {
    const inTitle = task({ id: 'title', title: 'focus trap' })
    const inNotes = task({
      id: 'notes',
      title: 'something',
      notes: 'focus trap here',
    })
    expect(
      sortTasks([inNotes, inTitle], 'relevance', 'focus').map((t) => t.id),
    ).toEqual(['title', 'notes'])
  })

  it('ranks a title that starts with the term highest', () => {
    const starts = task({ id: 'starts', title: 'focus trap in the dialog' })
    const contains = task({ id: 'contains', title: 'fix the focus trap' })
    expect(
      sortTasks([contains, starts], 'relevance', 'focus').map((t) => t.id),
    ).toEqual(['starts', 'contains'])
  })

  it('falls back to created order when relevance is asked for with no query', () => {
    const old = task({ id: 'old', createdAt: '2026-09-01T00:00:00Z' })
    const recent = task({ id: 'new', createdAt: '2026-09-10T00:00:00Z' })
    expect(
      sortTasks([old, recent], 'relevance', '  ').map((t) => t.id),
    ).toEqual(['new', 'old'])
  })

  it('never mutates its input, because the input is the Query cache', () => {
    const input = [later, soon]
    const before = input.map((t) => t.id)
    sortTasks(input, 'due', undefined)
    expect(input.map((t) => t.id)).toEqual(before)
  })
})

describe('groupByDue', () => {
  const tasks = [
    task({ id: 'over', dueAt: at('2026-09-17T09:00:00.000Z') }),
    task({ id: 'today', dueAt: at('2026-09-19T20:00:00.000Z') }),
    task({ id: 'week', dueAt: at('2026-09-23T09:00:00.000Z') }),
    task({ id: 'later', dueAt: at('2026-11-01T09:00:00.000Z') }),
    task({ id: 'nodate', dueAt: null }),
    task({ id: 'done', dueAt: at('2026-09-17T09:00:00.000Z'), status: 'done' }),
  ]

  it('groups in the order the design lays out', () => {
    expect(groupByDue(tasks, NOW).map((g) => g.key)).toEqual([
      'overdue',
      'today',
      'week',
      'later',
      'nodate',
      'done',
    ])
  })

  it('labels groups as the design names them', () => {
    const labels = Object.fromEntries(
      groupByDue(tasks, NOW).map((g) => [g.key, g.label]),
    )
    expect(labels.overdue).toBe('Overdue')
    expect(labels.today).toBe('Today')
    expect(labels.week).toBe('Later this week')
    expect(labels.done).toBe('Completed')
  })

  it('puts a completed task in Completed regardless of when it was due', () => {
    // It was overdue, but the design shows completed work in its own section.
    const done = groupByDue(tasks, NOW).find((g) => g.key === 'done')
    expect(done?.tasks.map((t) => t.id)).toEqual(['done'])
    const overdue = groupByDue(tasks, NOW).find((g) => g.key === 'overdue')
    expect(overdue?.tasks.map((t) => t.id)).toEqual(['over'])
  })

  it('drops empty groups rather than rendering an empty heading', () => {
    const only = groupByDue([task({ id: 'x', dueAt: null })], NOW)
    expect(only.map((g) => g.key)).toEqual(['nodate'])
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDue([], NOW)).toEqual([])
  })

  it('counts add up to the input length, so a heading cannot disagree with its rows', () => {
    const total = groupByDue(tasks, NOW).reduce((n, g) => n + g.tasks.length, 0)
    expect(total).toBe(tasks.length)
  })
})

describe('countByStatus', () => {
  it('counts each status, including zeroes', () => {
    const counts = countByStatus([
      task({ id: 'a', status: 'todo' }),
      task({ id: 'b', status: 'todo' }),
      task({ id: 'c', status: 'doing' }),
    ])
    expect(counts).toEqual({ todo: 2, doing: 1, done: 0 })
  })

  it('returns zeroes for an empty list', () => {
    expect(countByStatus([])).toEqual({ todo: 0, doing: 0, done: 0 })
  })
})

describe('hiddenByStatus', () => {
  const tasks = [
    task({ id: 'a', title: 'focus trap', status: 'todo' }),
    task({ id: 'b', title: 'focus ring', status: 'done' }),
    task({ id: 'c', title: 'focus order', status: 'done' }),
  ]

  it('counts what the query matches but the status filter is hiding', () => {
    // Powers "2 completed tasks also match but are hidden by the status filter",
    // which is the difference between an empty result and a misleading one.
    expect(hiddenByStatus(tasks, { q: 'focus', status: ['todo'] }, NOW)).toBe(2)
  })

  it('is zero when no status filter is applied', () => {
    expect(hiddenByStatus(tasks, { q: 'focus' }, NOW)).toBe(0)
    expect(hiddenByStatus(tasks, { q: 'focus', status: [] }, NOW)).toBe(0)
  })

  it('is zero when the status filter hides nothing', () => {
    expect(
      hiddenByStatus(
        tasks,
        { q: 'focus', status: ['todo', 'doing', 'done'] },
        NOW,
      ),
    ).toBe(0)
  })
})

describe('hasActiveFilters', () => {
  it.each([
    [{}, false],
    [{ q: '' }, false],
    [{ q: '   ' }, false],
    [{ q: 'focus' }, true],
    [{ status: [] as TaskStatus[] }, false],
    [{ status: ['todo'] as TaskStatus[] }, true],
    [{ due: 'any' as const }, false],
    [{ due: 'week' as const }, true],
    // Sort is not a filter: it changes the order, not the set.
    [{ sort: 'due' as const }, false],
  ])('%j -> %s', (filters, expected) => {
    expect(hasActiveFilters(filters)).toBe(expected)
  })
})

describe('list filter', () => {
  const tasks = [
    task({ id: 'ship', listId: 'ship-v1' }),
    task({ id: 'docs', listId: 'docs' }),
    task({ id: 'none', listId: null }),
  ]

  it('keeps only the chosen list', () => {
    expect(filterTasks(tasks, { list: 'docs' }, NOW).map((t) => t.id)).toEqual([
      'docs',
    ])
  })

  it('never matches an unlisted task to a list filter', () => {
    expect(
      filterTasks(tasks, { list: 'ship-v1' }, NOW).map((t) => t.id),
    ).toEqual(['ship'])
  })

  it('counts as an active filter', () => {
    expect(hasActiveFilters({ list: 'docs' })).toBe(true)
  })
})
