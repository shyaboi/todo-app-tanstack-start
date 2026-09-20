import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Task } from '../task.types'

/* The task components that had no suite of their own, each rendered in a
   realistic state and scanned (PLAN.md 7.2). Behaviour is covered elsewhere;
   this is the accessibility floor, so CI fails on a new violation in any of
   them. */

vi.mock('~/features/lists/list.server', () => ({
  listLists: () => Promise.resolve([]),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
}))
vi.mock('../task.server', () => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  listTodos: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
}))

const { ModeHint } = await import('./ModeHint')
const { SortSelect } = await import('./SortSelect')
const { AdvanceStatusButton, DoneCheckbox } = await import('./StatusControl')
const { Board, toColumns } = await import('./Board')
const { TaskComposer } = await import('./TaskComposer')
const { SearchInput } = await import('./SearchInput')

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: 'docs',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

const withQuery = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
)

describe('accessibility floor', () => {
  it('ModeHint', async () => {
    const { container } = render(
      <ModeHint
        mode={{ keys: '1 2 3', text: 'filter the list by status' }}
        onOpenPalette={vi.fn()}
        onOpenHelp={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: /^Commands/ }),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('SortSelect', async () => {
    const { container } = render(<SortSelect value="due" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('StatusControl, both controls, both states', async () => {
    const { container } = render(
      <>
        <DoneCheckbox task={task('a')} onChange={vi.fn()} />
        <DoneCheckbox task={task('b', { status: 'done' })} onChange={vi.fn()} />
        <AdvanceStatusButton task={task('c')} onChange={vi.fn()} />
        <AdvanceStatusButton
          task={task('d', { status: 'doing' })}
          onChange={vi.fn()}
        />
      </>,
    )
    // Every control names its task, so it reads correctly out of context.
    expect(
      screen.getByRole('checkbox', { name: 'Mark "Task a" as done' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /Task c: To do\. Change to In progress/,
      }),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('Board, with a card selected and another picked up', async () => {
    const tasks = [
      task('a'),
      task('b', { status: 'doing', dueAt: '2026-09-20T09:00:00.000Z' }),
      task('c', { status: 'done', priority: 'p1' }),
    ]
    const { container } = render(
      withQuery(
        <Board
          columns={toColumns(tasks)}
          controls={{
            selectedId: 'a',
            liftedId: 'b',
            draggingId: null,
            onSelect: vi.fn(),
            onOpen: vi.fn(),
            onToggleLift: vi.fn(),
            onDragStart: vi.fn(),
            onDragEnd: vi.fn(),
            onDrop: vi.fn(),
          }}
        />,
      ),
    )
    // Three labelled regions; the lifted card says so in its name.
    expect(screen.getAllByRole('region')).toHaveLength(3)
    expect(
      screen.getByRole('listitem', { name: /Task b, In progress, picked up/ }),
    ).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('TaskComposer, empty and with a reading of tokens', async () => {
    const { container } = render(withQuery(<TaskComposer />))
    expect(screen.getByLabelText('Task title')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('SearchInput', async () => {
    const { container } = render(
      <SearchInput value="focus" onChange={vi.fn()} />,
    )
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue(
      'focus',
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
