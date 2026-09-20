import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { Button } from './Button'
import { Field } from './Field'
import { StatusPill, PriorityPill, STATUS_LABEL } from './Pill'
import { Kbd } from './Kbd'

describe('Button', () => {
  it('is a real button element, not a div wearing a role', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).tagName).toBe('BUTTON')
  })

  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('blocks interaction and marks itself busy while loading', async () => {
    const user = userEvent.setup()
    let clicks = 0
    render(
      <Button loading onClick={() => (clicks += 1)}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(clicks).toBe(0)
  })

  it('keeps an accessible name when it renders an icon only', async () => {
    const { container } = render(
      <Button iconOnly aria-label="Delete task">
        <svg width="16" height="16" aria-hidden="true" />
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeVisible()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('Field', () => {
  it('associates a real label with the control', () => {
    render(<Field label="Title" />)
    // getByLabelText only passes with a genuine label/control association.
    expect(screen.getByLabelText('Title')).toBeInstanceOf(HTMLInputElement)
  })

  it('exposes the error to assistive tech, not just to the eye', () => {
    render(<Field label="Title" error="Title is required" />)
    const input = screen.getByLabelText('Title')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(input.getAttribute('aria-describedby')).toContain(
      screen.getByRole('alert').id,
    )
  })

  it('has no axe violations in the invalid state', async () => {
    const { container } = render(
      <Field
        label="Title"
        description="1 to 200 characters."
        error="Too long"
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('StatusPill', () => {
  it.each(['todo', 'doing', 'done'] as const)(
    'carries a text label for %s, so status is never colour alone',
    (status) => {
      render(<StatusPill status={status} />)
      expect(screen.getByText(STATUS_LABEL[status])).toBeVisible()
    },
  )

  it('renders priority as readable text', () => {
    render(<PriorityPill priority="p1" />)
    expect(screen.getByText('P1')).toBeVisible()
  })
})

describe('Kbd', () => {
  it('renders each key in a <kbd> element', () => {
    const { container } = render(<Kbd keys="G I" />)
    expect(container.querySelectorAll('kbd')).toHaveLength(2)
  })
})
