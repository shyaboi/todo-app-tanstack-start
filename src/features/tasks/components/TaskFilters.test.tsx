import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { TaskFilters } from './TaskFilters'
import type { TaskSearch } from '../task.search-params'

function setup(search: TaskSearch = {}, hidden = 0) {
  const onChange = vi.fn()
  const view = render(
    <TaskFilters
      search={search}
      counts={{ todo: 5, doing: 3, done: 2 }}
      total={10}
      hidden={hidden}
      onChange={onChange}
    />,
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
    const { onChange } = setup({ list: 'docs' })
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

  it('explains what the status filter is hiding, and offers the way out', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ q: 'status', status: 'todo' }, 2)
    expect(screen.getByText(/2 more tasks match but are hidden/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Show all statuses' }))
    expect(onChange).toHaveBeenCalledWith({ status: undefined })
  })

  it('says nothing about hidden tasks when there are none', () => {
    setup({ q: 'focus', status: 'todo' }, 0)
    expect(screen.queryByText(/hidden by the status filter/)).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const { container } = setup({ status: 'todo', due: 'week' }, 1)
    expect(await axe(container)).toHaveNoViolations()
  })
})
