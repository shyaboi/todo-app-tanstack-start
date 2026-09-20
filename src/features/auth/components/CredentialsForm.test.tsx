import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { CredentialsForm } from './CredentialsForm'

/* The one form a stranger meets first. Its labels, its errors and its
   server-failure line all have to be reachable by assistive tech, and a
   sign-in failure must never say which half was wrong (PLAN.md 4.8).

   Mounted inside a real router: the form links to its counterpart, and a
   stubbed Link would be a test of the stub. */
function mount(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => ui })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('CredentialsForm', () => {
  it('labels both fields and submits what was typed', async () => {
    const onSubmit = vi.fn()
    mount(
      <CredentialsForm
        mode="sign-in"
        pending={false}
        formError={null}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'seed-password-ada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'seed-password-ada',
    })
  })

  it('a server failure is announced, above the fields, and is not field-specific', async () => {
    mount(
      <CredentialsForm
        mode="sign-in"
        pending={false}
        formError="That email and password do not match."
        onSubmit={vi.fn()}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match.',
    )
  })

  it('has no accessibility violations, clean or failing, in either mode', async () => {
    const clean = mount(
      <CredentialsForm
        mode="sign-up"
        pending={false}
        formError={null}
        onSubmit={vi.fn()}
      />,
    )
    await screen.findByLabelText(/email/i)
    expect(await axe(clean.container)).toHaveNoViolations()
    clean.unmount()

    const failing = mount(
      <CredentialsForm
        mode="sign-in"
        pending={true}
        formError="That email and password do not match."
        onSubmit={vi.fn()}
      />,
    )
    await screen.findByRole('alert')
    expect(await axe(failing.container)).toHaveNoViolations()
  })
})
