import { describe, it, expect, vi } from 'vitest'
import { buildTaskCommands } from './task.commands'
import type { TaskCommandContext } from './task.commands'
import { isLive } from '~/shared/lib/commands'
import { parseKeys } from '~/shared/lib/keys'
import type { Task } from './task.types'
import type { TaskSearch } from './task.search-params'

const task: Task = {
  id: 'abc',
  title: 'a task',
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

function ctx(over: Partial<TaskCommandContext> = {}): TaskCommandContext {
  return {
    selected: null,
    search: {},
    updateSearch: vi.fn(),
    goTo: vi.fn(),
    setStatus: vi.fn(),
    startEdit: vi.fn(),
    requestDelete: vi.fn(),
    duplicate: vi.fn(),
    moveSelection: vi.fn(),
    escape: vi.fn(),
    focusComposer: vi.fn(),
    focusSearch: vi.fn(),
    openPalette: vi.fn(),
    ...over,
  }
}

const byId = (c: TaskCommandContext, id: string) => {
  const found = buildTaskCommands(c).find((cmd) => cmd.id === id)
  if (!found) throw new Error('no command ' + id)
  return found
}

describe('the registry as a whole', () => {
  it('has unique ids and parseable keys', () => {
    const commands = buildTaskCommands(ctx())
    const ids = commands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of commands) {
      if (c.keys) expect(() => parseKeys(c.keys!)).not.toThrow()
    }
  })

  it('registers nothing for bindings that have no home yet', () => {
    // Board keys wait for Sprint 6; ⌘Z and ⇧1…3 are cut. A no-op command in
    // the palette would be a promise the app does not keep.
    const keys = buildTaskCommands(ctx()).map((c) => c.keys)
    for (const absent of ['←', '→', '⇧→', 'G B', 'V', 'D', '⌘Z', '⇧⌘Z']) {
      expect(keys).not.toContain(absent)
    }
  })
})

describe('the contextual number keys (design rule 02)', () => {
  it('1 sets status when a task is selected', () => {
    const c = ctx({ selected: task })
    const live = buildTaskCommands(c).filter(
      (cmd) => cmd.keys === '1' && isLive(cmd, true),
    )
    expect(live.map((cmd) => cmd.id)).toEqual(['set-status-todo'])
    live[0]!.run()
    expect(c.setStatus).toHaveBeenCalledWith(task, 'todo')
  })

  it('1 filters when nothing is selected', () => {
    const c = ctx()
    const live = buildTaskCommands(c).filter(
      (cmd) => cmd.keys === '1' && isLive(cmd, false),
    )
    expect(live.map((cmd) => cmd.id)).toEqual(['filter-todo'])
    live[0]!.run()
    expect(c.updateSearch).toHaveBeenCalledWith({ status: 'todo' })
  })

  it('pressing the active filter key again clears it', () => {
    const c = ctx({ search: { status: 'todo' } })
    byId(c, 'filter-todo').run()
    expect(c.updateSearch).toHaveBeenCalledWith({ status: undefined })
  })

  it('never has both meanings live at once', () => {
    for (const hasSelection of [true, false]) {
      const live = buildTaskCommands(
        ctx({ selected: hasSelection ? task : null }),
      ).filter((cmd) => cmd.keys === '2' && isLive(cmd, hasSelection))
      expect(live).toHaveLength(1)
    }
  })
})

describe('selected-task commands', () => {
  it('are listed but disabled with nothing selected', () => {
    for (const id of ['advance-status', 'edit-title', 'duplicate', 'delete']) {
      const cmd = byId(ctx(), id)
      expect(cmd.enabled).toBe(false)
      expect(isLive(cmd, false)).toBe(false)
    }
  })

  it('advance walks to do → in progress → done → to do', () => {
    for (const [from, to] of [
      ['todo', 'doing'],
      ['doing', 'done'],
      ['done', 'todo'],
    ] as const) {
      const c = ctx({ selected: { ...task, status: from } })
      byId(c, 'advance-status').run()
      expect(c.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: from }),
        to,
      )
    }
  })

  it('edit, duplicate and delete hand the selected task to the page', () => {
    const c = ctx({ selected: task })
    byId(c, 'edit-title').run()
    byId(c, 'duplicate').run()
    byId(c, 'delete').run()
    expect(c.startEdit).toHaveBeenCalledWith(task)
    expect(c.duplicate).toHaveBeenCalledWith(task)
    expect(c.requestDelete).toHaveBeenCalledWith(task)
  })

  it('↵ is an alias for edit until the detail panel exists, and is not listed twice', () => {
    const open = byId(ctx({ selected: task }), 'open-task')
    expect(open.keys).toBe('↵')
    expect(open.hidden).toBe(true)
  })
})

describe('filters & views', () => {
  it('⇧C hides completed by filtering to the two open statuses, and shows them again', () => {
    const hide = ctx()
    byId(hide, 'toggle-completed').run()
    expect(hide.updateSearch).toHaveBeenCalledWith({ status: 'todo,doing' })
    expect(byId(hide, 'toggle-completed').label).toBe('Hide completed tasks')

    const show = ctx({ search: { status: 'todo,doing' } })
    expect(byId(show, 'toggle-completed').label).toBe('Show completed tasks')
    byId(show, 'toggle-completed').run()
    expect(show.updateSearch).toHaveBeenCalledWith({ status: undefined })
  })

  it('A shows all statuses', () => {
    const c = ctx({ search: { status: 'done' } })
    byId(c, 'show-all').run()
    expect(c.updateSearch).toHaveBeenCalledWith({ status: undefined })
  })

  it('⇧⌘X clears every filter and the query but keeps the sort', () => {
    const c = ctx({
      search: { q: 'focus', status: 'todo', due: 'week', sort: 'created' },
    })
    byId(c, 'clear-filters').run()
    expect(c.goTo).toHaveBeenCalledWith({ sort: 'created' })
  })
})

describe('navigation', () => {
  it('G I goes to the unfiltered inbox and G T to today', () => {
    const c = ctx({ search: { q: 'x' } })
    byId(c, 'go-inbox').run()
    expect(c.goTo).toHaveBeenCalledWith({})
    byId(c, 'go-today').run()
    expect(c.goTo).toHaveBeenLastCalledWith({
      due: 'today',
    } satisfies TaskSearch)
  })

  it('arrows move the selection and are hidden from the palette', () => {
    const c = ctx()
    const down = byId(c, 'select-next')
    const up = byId(c, 'select-previous')
    expect(down.hidden).toBe(true)
    expect(up.hidden).toBe(true)
    down.run()
    up.run()
    expect(c.moveSelection).toHaveBeenNthCalledWith(1, 1)
    expect(c.moveSelection).toHaveBeenNthCalledWith(2, -1)
  })
})
