import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { KeyboardMap } from './KeyboardMap'
import type { Command } from '../lib/commands'

/* The overlay's contract is that it is GENERATED: a key that exists in the
   registry appears here, and one that does not, does not. These tests assert
   that rather than the particular list, which is the page's business. */

const commands: Command[] = [
  {
    id: 'new-task',
    label: 'New task',
    keys: 'N',
    group: 'Tasks',
    run: vi.fn(),
  },
  {
    id: 'no-key',
    label: 'Palette only, no binding',
    group: 'Tasks',
    run: vi.fn(),
  },
  {
    id: 'select-next',
    label: 'Move the selection down',
    keys: '↓',
    group: 'Navigate',
    hidden: true,
    run: vi.fn(),
  },
  {
    id: 'set-status-todo',
    label: 'Set status: To do',
    keys: '1',
    group: 'Selected task',
    when: 'selection',
    enabled: false,
    run: vi.fn(),
  },
  {
    id: 'filter-todo',
    label: 'Filter by To do',
    keys: '1',
    group: 'Filters & views',
    when: 'no-selection',
    run: vi.fn(),
  },
]

function setup(over: Partial<Parameters<typeof KeyboardMap>[0]> = {}) {
  const props = {
    commands,
    hasSelection: false,
    unbuilt: [{ keys: 'G B', label: 'Go to the board (Sprint 6)' }],
    onClose: vi.fn(),
    ...over,
  }
  return { ...props, ...render(<KeyboardMap {...props} />) }
}

describe('KeyboardMap', () => {
  it('lists every bound command, grouped, and skips unbound ones', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Keyboard' })
    expect(within(dialog).getByText('New task')).toBeInTheDocument()
    expect(within(dialog).queryByText('Palette only, no binding')).toBeNull()

    // Hidden means "not a palette row", not "undocumented".
    expect(
      within(dialog).getByText('Move the selection down'),
    ).toBeInTheDocument()

    expect(
      within(dialog).getByRole('heading', { name: 'Selected task' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Filters & views' }),
    ).toBeInTheDocument()
  })

  it('says which of the two contextual meanings applies right now', () => {
    const { unmount } = setup({ hasSelection: false })
    expect(screen.getByText(/Set status: To do/)).toHaveTextContent(
      'with a task selected',
    )
    expect(screen.getByText(/Filter by To do/)).not.toHaveTextContent(
      'with nothing selected',
    )
    unmount()

    setup({ hasSelection: true })
    expect(screen.getByText(/Filter by To do/)).toHaveTextContent(
      'with nothing selected',
    )
  })

  it('names the bindings the design draws but this build has not built', () => {
    setup()
    expect(
      screen.getByRole('heading', { name: 'Not in this build yet' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Go to the board (Sprint 6)')).toBeInTheDocument()
  })

  it('shows keys resolved for the platform', () => {
    // jsdom reports a non-Mac platform, so ⌘ must read as Ctrl.
    setup({
      commands: [
        {
          id: 'palette',
          label: 'Open the command palette',
          keys: '⌘K',
          group: 'Help',
          run: vi.fn(),
        },
      ],
    })
    const keys = screen.getAllByText((_, el) => el?.tagName === 'KBD')
    expect(keys.map((k) => k.textContent)).toContain('Ctrl')
    expect(keys.map((k) => k.textContent)).not.toContain('⌘K')
  })

  it('closes from the button and returns focus to the trigger', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { onClose, unmount } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('has no accessibility violations', async () => {
    const { container } = setup()
    expect(await axe(container)).toHaveNoViolations()
  })
})
