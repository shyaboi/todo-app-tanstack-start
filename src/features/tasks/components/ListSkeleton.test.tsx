import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ListSkeleton } from './ListSkeleton'

describe('ListSkeleton', () => {
  it('is announced once, as a busy status, and says what is loading', () => {
    render(<ListSkeleton />)
    const status = screen.getByRole('status', { name: 'Loading your tasks' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    // The bars inside say nothing of their own.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ListSkeleton />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
