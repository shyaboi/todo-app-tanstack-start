import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import type { Task } from '../task.types'
import type { TaskSearch } from '../task.search-params'

/* The bar reads both caches and renders links, so it gets a real client and a
   real router; stubbing either would be a test of the stub. */
vi.mock('~/features/lists/list.server', () => ({
  listLists: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
}))
vi.mock('../task.server', () => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
}))
vi.mock('~/features/auth/auth.server', () => ({
  me: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))

const { TopBar } = await import('./TopBar')
const { tasksQueryKey } = await import('../task.query')
const { listsQueryKey } = await import('~/features/lists/list.query')
const { viewerQueryKey } = await import('~/features/auth/auth.query')

const DOCS = {
  id: '64b0c0ffee0ddba11ad00002',
  name: 'Docs',
  createdAt: '2026-09-01T00:00:00.000Z',
}

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

const tasks = [
  task('a'),
  task('b', { status: 'doing' }),
  task('c', { status: 'done', title: 'Task c done' }),
]

function setup(search: TaskSearch = {}) {
  const onChange = vi.fn()
  const onSearch = vi.fn()
  const onSort = vi.fn()

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(tasksQueryKey, tasks)
  client.setQueryData(listsQueryKey, [DOCS])
  client.setQueryData(viewerQueryKey, {
    userId: 'u1',
    email: 'ada@example.com',
    isGuest: false,
  })

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <TopBar
          search={search}
          sort="due"
          onChange={onChange}
          onSearch={onSearch}
          onSort={onSort}
        />
      </QueryClientProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { ...render(<RouterProvider router={router} />), onChange, onSearch }
}

const filtersToggle = () => screen.getByRole('button', { name: /^Filters/ })

describe('TopBar', () => {
  it('shows search and sort, and keeps the filters shut until asked', async () => {
    setup()
    expect(
      await screen.findByRole('searchbox', { name: 'Search tasks' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(filtersToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull()
  })

  it('opens the panel, and the chips are in it', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }))
    expect(filtersToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'List' })).toBeInTheDocument()
  })

  it('says how many filters are narrowing the view, without being opened', async () => {
    setup({ q: 'focus', status: 'todo,doing', due: 'week', list: DOCS.id })
    await screen.findByRole('searchbox', { name: 'Search tasks' })
    expect(filtersToggle()).toHaveTextContent('4')
    // And names each one, in the words the person chose.
    expect(screen.getByRole('button', { name: /“focus”/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /To do or In progress/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /This week/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Docs/ })).toBeInTheDocument()
  })

  it('each active chip removes its own filter', async () => {
    const { onChange } = setup({ q: 'focus', due: 'week' })
    fireEvent.click(await screen.findByRole('button', { name: /“focus”/ }))
    expect(onChange).toHaveBeenCalledWith({ q: undefined })
    fireEvent.click(screen.getByRole('button', { name: /This week/ }))
    expect(onChange).toHaveBeenCalledWith({ due: undefined })
  })

  /* The line that explains an empty list. It has to be visible without
     opening anything -- you would only open the filters if you already
     suspected them, which is the thing this sentence is there to tell you. */
  it('says when the status filter is what is hiding a match, panel shut', async () => {
    const { onChange } = setup({ q: 'done', status: 'todo' })
    expect(
      await screen.findByText(/1 more task matches but is hidden/),
    ).toBeInTheDocument()
    expect(filtersToggle()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Show all statuses' }))
    expect(onChange).toHaveBeenCalledWith({ status: undefined })
  })

  it('has no accessibility violations, open or shut', async () => {
    const { container } = setup({ status: 'todo' })
    await screen.findByRole('searchbox', { name: 'Search tasks' })
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.click(filtersToggle())
    expect(await axe(container)).toHaveNoViolations()
  })
})
