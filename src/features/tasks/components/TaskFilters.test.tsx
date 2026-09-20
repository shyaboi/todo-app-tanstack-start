import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/* The panel reads the owner's lists from the cache (PLAN.md D14), so it needs
   a client and a boundary -- neither of which it should reach for itself. */
const LISTS = [
  {
    id: '64b0c0ffee0ddba11ad00002',
    name: 'Docs',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: '64b0c0ffee0ddba11ad00003',
    name: 'Infra',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
]
vi.mock('~/features/lists/list.server', () => ({
  listLists: () => Promise.resolve(LISTS),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
}))

const { TaskFilters } = await import('./TaskFilters')
const { listsQueryKey } = await import('~/features/lists/list.query')
import type { TaskSearch } from '../task.search-params'

function setup(search: TaskSearch = {}) {
  const onChange = vi.fn()
  const queryClient = new QueryClient()
  queryClient.setQueryData(listsQueryKey, LISTS)
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TaskFilters
        search={search}
        counts={{ todo: 5, doing: 3, done: 2 }}
        total={10}
        onChange={onChange}
      />
    </QueryClientProvider>,
  )
  return { onChange, ...view }
}

const pressed = (name: RegExp) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('TaskFilters', () => {
  it('shows counts from the unfiltered list, as the design does', () => {
    setup()
    expect(screen.getByRole('button', { name: /^All 10/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^To do 5/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^In progress 3/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Done 2/ })).toBeVisible()
  })

  it('marks All pressed when no status is selected', () => {
    setup()
    expect(pressed(/^All/)).toBe('true')
    expect(pressed(/^To do/)).toBe('false')
  })

  it('reflects a comma-joined status from the URL', () => {
    setup({ status: 'todo,doing' })
    expect(pressed(/^To do/)).toBe('true')
    expect(pressed(/^In progress/)).toBe('true')
    expect(pressed(/^Done/)).toBe('false')
    expect(pressed(/^All/)).toBe('false')
  })

  it('adds a status to the selection, in URL form', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ status: 'todo' })
    await user.click(screen.getByRole('button', { name: /^In progress/ }))
    expect(onChange).toHaveBeenCalledWith({ status: 'todo,doing' })
  })

  it('removes a status, and drops the key when the last one goes', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ status: 'todo' })
    await user.click(screen.getByRole('button', { name: /^To do/ }))
    // undefined, not '': an empty status must not appear in the URL.
    expect(onChange).toHaveBeenCalledWith({ status: undefined })
  })

  it('All clears the status selection', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ status: 'todo,doing' })
    await user.click(screen.getByRole('button', { name: /^All/ }))
    expect(onChange).toHaveBeenCalledWith({ status: undefined })
  })

  it('selects a due window', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()
    await user.click(screen.getByRole('button', { name: 'This week' }))
    expect(onChange).toHaveBeenCalledWith({ due: 'week' })
  })

  it('toggles a list off when it is clicked again', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ list: LISTS[0]!.id })
    await user.click(screen.getByRole('button', { name: 'Docs' }))
    expect(onChange).toHaveBeenCalledWith({ list: undefined })
  })

  it('offers Clear all only when something is narrowing the list', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })

  it('Clear all removes every filter but leaves the sort alone', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ q: 'focus', status: 'todo', sort: 'due' })
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenCalledWith({
      q: undefined,
      status: undefined,
      due: undefined,
      list: undefined,
    })
  })

  /* "N more are hidden" moved to the top bar in 8.4a, where it is visible
     without opening this panel; TopBar.test.tsx covers it. */

  it('has no accessibility violations', async () => {
    const { container } = setup({ status: 'todo', due: 'week' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
