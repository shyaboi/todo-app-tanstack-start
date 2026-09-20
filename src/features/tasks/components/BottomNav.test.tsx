import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { BottomNav } from './BottomNav'

function mount(onActions = vi.fn(), path = '/') {
  const rootRoute = createRootRoute({
    component: () => <BottomNav onActions={onActions} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return { ...render(<RouterProvider router={router} />), onActions }
}

describe('BottomNav', () => {
  it('is a labelled navigation of three links and one button, each with a name', async () => {
    mount()
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    expect(nav.querySelectorAll('a')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Board' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    // No listitems: every one on the page belongs to the task list.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('Actions opens the palette; the links say which one is current', async () => {
    const { onActions } = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Actions' }))
    expect(onActions).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Board' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('has no accessibility violations', async () => {
    const { container } = mount()
    await screen.findByRole('navigation', { name: 'Primary' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
