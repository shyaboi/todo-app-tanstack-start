import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { axe } from 'vitest-axe'
import type { ReactNode } from 'react'
import type { Task } from '../task.types'
import { groupByDue } from '../task.filters'

// Rows carry mutation hooks, so the server boundary is mocked out and a
// QueryClient is provided; nothing here reaches the network.
vi.mock('../task.server', () => ({
  updateTodo: vi.fn(),
  createTodo: vi.fn(),
  listTodos: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
}))

const { TaskGroups } = await import('./TaskList')

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

function renderGroups() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(
    <TaskGroups
      groups={groupByDue(tasks, NOW)}
      onDelete={() => {}}
      now={NOW}
    />,
    { wrapper },
  )
}

describe('TaskGroups', () => {
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
