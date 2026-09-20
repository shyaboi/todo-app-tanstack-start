import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { RouteError } from './RouteError'

/* Rendered inside a real router: the view uses Link and router.invalidate,
   and a stub for either would be a test of the stub. */
function mount(error: unknown, reset = vi.fn()) {
  const rootRoute = createRootRoute({
    component: () => <RouteError error={error as Error} reset={reset} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue(undefined)
  const view = render(<RouterProvider router={router} />)
  return { ...view, reset, invalidate }
}

describe('RouteError', () => {
  it('shows the server’s message and id, never the bare fallback', async () => {
    mount({
      code: 'DB_UNAVAILABLE',
      message:
        'Could not reach the database. Your change was rolled back — try again in a moment.',
      errorId: 'k3j4h5g6',
    })
    expect(
      await screen.findByRole('heading', { name: 'This page could not load' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not reach the database',
    )
    expect(screen.getByText('k3j4h5g6')).toBeInTheDocument()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
  })

  it('Try again resets the boundary and re-runs the loaders', async () => {
    const { reset, invalidate } = mount(new TypeError('Failed to fetch'))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('never echoes an error it did not write', async () => {
    mount(
      new Error(
        'MongoServerSelectionError: getaddrinfo ENOTFOUND cluster0-shard-00-00.example.net',
      ),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('ENOTFOUND')
    expect(alert).not.toHaveTextContent('cluster0')
    expect(alert).toHaveTextContent(/rolled back/)
  })

  it('has no accessibility violations', async () => {
    const { container } = mount({
      code: 'UNKNOWN',
      message: 'Something failed on the server.',
      errorId: 'id',
    })
    await screen.findByRole('alert')
    expect(await axe(container)).toHaveNoViolations()
  })
})
