import { describe, it, expect, vi } from 'vitest'
import { buildBoardCommands } from './board.commands'
import type { BoardCommandContext } from './board.commands'
import { isLive } from '~/shared/lib/commands'
import type { Task } from './task.types'

const task = (id: string, status: Task['status']): Task => ({
  id,
  title: `task ${id}`,
  notes: null,
  status,
  dueAt: null,
  priority: 'p2',
  listId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
})

function ctx(over: Partial<BoardCommandContext> = {}): BoardCommandContext {
  return {
    view: 'board',
    selected: null,
    lifted: false,
    moveSelection: vi.fn(),
    moveColumn: vi.fn(),
    setStatus: vi.fn(),
    toggleLift: vi.fn(),
    openTask: vi.fn(),
    escape: vi.fn(),
    goTo: vi.fn(),
    goToBoard: vi.fn(),
    toggleView: vi.fn(),
    openPalette: vi.fn(),
    openHelp: vi.fn(),
    ...over,
  }
}

const byId = (c: BoardCommandContext, id: string) => {
  const found = buildBoardCommands(c).find((cmd) => cmd.id === id)
  if (!found) throw new Error('no command ' + id)
  return found
}

describe('buildBoardCommands', () => {
  it('arrows move the selection between rows and columns when nothing is lifted', () => {
    const c = ctx({ selected: task('a', 'todo') })
    byId(c, 'board-down').run()
    byId(c, 'board-right').run()
    expect(c.moveSelection).toHaveBeenCalledWith(1)
    expect(c.moveColumn).toHaveBeenCalledWith(1)
    expect(c.setStatus).not.toHaveBeenCalled()
  })

  it('with a card lifted, ← and → carry it and stop at the edges', () => {
    const doing = ctx({ selected: task('a', 'doing'), lifted: true })
    byId(doing, 'board-right').run()
    expect(doing.setStatus).toHaveBeenCalledWith(doing.selected, 'done')
    byId(doing, 'board-left').run()
    expect(doing.setStatus).toHaveBeenCalledWith(doing.selected, 'todo')
    expect(doing.moveColumn).not.toHaveBeenCalled()

    const done = ctx({ selected: task('b', 'done'), lifted: true })
    byId(done, 'board-right').run()
    expect(done.setStatus).not.toHaveBeenCalled()
    expect(done.moveColumn).not.toHaveBeenCalled()
  })

  it('⇧→ moves the card to the next status, and is inert at Done', () => {
    const c = ctx({ selected: task('a', 'todo') })
    const advance = byId(c, 'board-advance')
    expect(isLive(advance, true)).toBe(true)
    advance.run()
    expect(c.setStatus).toHaveBeenCalledWith(c.selected, 'doing')

    const atEnd = ctx({ selected: task('b', 'done') })
    expect(isLive(byId(atEnd, 'board-advance'), true)).toBe(false)
    expect(byId(atEnd, 'board-advance').hint).toBe('Already done')
  })

  it('⇧← moves it back, and is inert at To do', () => {
    const c = ctx({ selected: task('a', 'done') })
    byId(c, 'board-retreat').run()
    expect(c.setStatus).toHaveBeenCalledWith(c.selected, 'doing')
    expect(
      isLive(byId(ctx({ selected: task('b', 'todo') }), 'board-retreat'), true),
    ).toBe(false)
  })

  it('Space picks up and drops, and its label says which', () => {
    expect(byId(ctx({ selected: task('a', 'todo') }), 'board-lift').label).toBe(
      'Pick the card up',
    )
    expect(
      byId(ctx({ selected: task('a', 'todo'), lifted: true }), 'board-lift')
        .label,
    ).toBe('Drop the card')
    expect(isLive(byId(ctx(), 'board-lift'), false)).toBe(false)
  })

  it('carries the shared navigation: G B is inert here, V goes to the list', () => {
    const c = ctx()
    expect(byId(c, 'go-board').enabled).toBe(false)
    byId(c, 'toggle-view').run()
    expect(c.toggleView).toHaveBeenCalled()
    expect(byId(c, 'open-palette').keys).toBe('⌘K')
    expect(byId(c, 'open-help').keys).toBe('?')
  })

  it('every key parses and no id repeats', () => {
    const commands = buildBoardCommands(ctx({ selected: task('a', 'doing') }))
    const ids = commands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
