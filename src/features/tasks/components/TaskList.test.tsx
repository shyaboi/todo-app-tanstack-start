import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { axe } from 'vitest-axe'
import type { ReactNode } from 'react'
import type { Task } from '../task.types'
import { groupByDue } from '../task.filters'
import type { RowControls } from './TaskList'

// Rows carry mutation hooks, so the server boundary is mocked out and a
// QueryClient is provided; nothing here reaches the network.
vi.mock('../task.server', () => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  listTodos: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
}))

const { TaskGroups, TaskList } = await import('./TaskList')

const NOW = new Date('2026-09-19T14:30:00.000Z')

function task(over: Partial<Task> & { id: string; title: string }): Task {
  return {
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

const tasks = [
  task({ id: 'o', title: 'late', dueAt: '2026-09-17T09:00:00.000Z' }),
  task({ id: 't1', title: 'this morning', dueAt: '2026-09-19T08:00:00.000Z' }),
  task({ id: 't2', title: 'tonight', dueAt: '2026-09-19T21:00:00.000Z' }),
  task({ id: 'w', title: 'midweek', dueAt: '2026-09-23T09:00:00.000Z' }),
  task({
    id: 'd',
    title: 'finished',
    status: 'done',
    dueAt: '2026-09-10T09:00:00.000Z',
  }),
]

function controls(over: Partial<RowControls> = {}): RowControls {
  return {
    selectedId: null,
    editingId: null,
    confirmingId: null,
    onSelect: vi.fn(),
    onEditingChange: vi.fn(),
    onConfirmingChange: vi.fn(),
    onDelete: vi.fn(),
    onOpen: vi.fn(),
    ...over,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('TaskGroups', () => {
  const renderGroups = (c = controls()) =>
    render(
      <TaskGroups groups={groupByDue(tasks, NOW)} controls={c} now={NOW} />,
      {
        wrapper,
      },
    )

  it('renders one labelled section per group, in the design’s order', () => {
    renderGroups()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'Overdue1',
      'Today · Sat 19 Sept2',
      'Later this week1',
      'Completed1',
    ])
  })

  it('puts the count in the heading, sourced from the same group as the rows', () => {
    renderGroups()
    const today = screen.getByRole('region', { name: /^Today/ })
    // Heading says 2; the list beneath it has exactly 2 items.
    expect(within(today).getAllByRole('listitem')).toHaveLength(2)
  })

  it('is one real list per group, so a screen reader hears each count', () => {
    renderGroups()
    expect(screen.getAllByRole('list')).toHaveLength(4)
  })

  it('has no accessibility violations', async () => {
    const { container } = renderGroups()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('TaskList rows and the keyboard', () => {
  const renderList = (c = controls()) =>
    render(<TaskList tasks={tasks.slice(0, 2)} controls={c} />, { wrapper })

  it('makes every row focusable by script but not a Tab stop', () => {
    renderList()
    for (const row of screen.getAllByRole('listitem')) {
      // -1: ↑↓ can land focus here, but Tab walks the controls inside instead.
      expect(row).toHaveAttribute('tabindex', '-1')
      expect(row).toHaveAttribute('data-task-row')
    }
  })

  it('selects a row when anything inside it takes focus', () => {
    const c = controls()
    renderList(c)
    // A click on the title button, not the row: focus bubbles up in React.
    const [firstRow] = screen.getAllByRole('listitem')
    fireEvent.focus(
      within(firstRow!).getByRole('button', { name: /^Edit title/ }),
    )
    expect(c.onSelect).toHaveBeenCalledWith('o')
  })

  it('marks the selected row as current, so selection is not colour alone', () => {
    renderList(controls({ selectedId: 't1' }))
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).not.toHaveAttribute('aria-current')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
  })

  it('opens the inline editor for whichever row the page says is editing', () => {
    renderList(controls({ editingId: 't1' }))
    expect(
      screen.getByRole('textbox', { name: 'Title of "this morning"' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: 'Title of "late"' }),
    ).toBeNull()
  })

  it('reports an edit starting from a click, rather than deciding itself', () => {
    const c = controls()
    renderList(c)
    fireEvent.click(screen.getByRole('button', { name: 'Edit title: late' }))
    expect(c.onEditingChange).toHaveBeenCalledWith('o', true)
  })

  it('reports a delete request, and shows the dialog only for the confirming row', () => {
    const c = controls()
    const { rerender } = renderList(c)
    fireEvent.click(screen.getByRole('button', { name: 'Delete "late"' }))
    expect(c.onConfirmingChange).toHaveBeenCalledWith('o', true)
    expect(screen.queryByRole('dialog')).toBeNull()

    rerender(
      <TaskList
        tasks={tasks.slice(0, 2)}
        controls={controls({ confirmingId: 'o' })}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows each control’s key on hover', () => {
    renderList()
    expect(
      screen.getByRole('button', { name: 'Delete "late"' }),
    ).toHaveAttribute(
      'title',
      expect.stringMatching(/Delete · (⌘⌫|Ctrl\+Backspace)/),
    )
    expect(
      screen.getByRole('button', {
        name: /^late: To do\. Change to In progress/,
      }),
    ).toHaveAttribute('title', 'Advance status · Space')
  })
})
