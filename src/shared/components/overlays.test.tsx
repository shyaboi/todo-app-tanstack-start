import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ConfirmDialog } from './ConfirmDialog'
import { UndoToast } from './UndoToast'

/* The two overlays that had no suite of their own (PLAN.md 7.2). Both are
   exercised end to end already; this pins their accessibility contract at
   the component level, where a regression is cheapest to catch. */

describe('ConfirmDialog', () => {
  function setup() {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const view = render(
      <ConfirmDialog
        title="Delete this task?"
        body='"Write the README" will be removed.'
        note="You can undo for 8 seconds."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    return { ...view, onConfirm, onCancel }
  }

  it('is a native modal dialog named by its heading', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Delete this task?' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
  })

  it('offers a real Cancel and a real confirm, in that order', () => {
    const { onConfirm, onCancel } = setup()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Delete'])
    fireEvent.click(buttons[1]!)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(buttons[0]!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('returns focus to where it came from on unmount', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = setup()
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('has no accessibility violations', async () => {
    const { container } = setup()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('UndoToast', () => {
  it('is a status, not an alert: the deletion already happened', () => {
    render(
      <UndoToast message="Task deleted" onUndo={vi.fn()} onExpire={vi.fn()} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Task deleted')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Undo is a real button', () => {
    const onUndo = vi.fn()
    render(<UndoToast message="x" onUndo={onUndo} onExpire={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <UndoToast message="Task deleted" onUndo={vi.fn()} onExpire={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
