import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { CommandPalette } from './CommandPalette'
import type { Command } from '~/shared/lib/commands'
import type { Task } from '../task.types'
import type { List } from '~/features/lists/list.types'

/* The combobox contract, asserted directly: focus stays in the input, the
   highlight travels through aria-activedescendant, Enter runs the highlighted
   row, and Escape returns focus to where it came from. */

function command(
  over: Partial<Command> & { id: string; label: string },
): Command {
  return { group: 'Tasks', run: vi.fn(), ...over }
}

const commands = [
  command({ id: 'new-task', label: 'New task', keys: 'N' }),
  command({
    id: 'go-inbox',
    label: 'Go to Inbox',
    keys: 'G I',
    group: 'Navigate',
  }),
  command({
    id: 'show-all',
    label: 'Show all statuses',
    keys: 'A',
    group: 'Filters & views',
  }),
  command({
    id: 'delete',
    label: 'Delete',
    keys: '⌘⌫',
    group: 'Selected task',
    enabled: false,
  }),
  command({ id: 'select-next', label: 'Move down', keys: '↓', hidden: true }),
]

const task = (id: string, title: string): Task => ({
  id,
  title,
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: 'docs',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
})
const tasks = [
  task('a', 'Wire optimistic updates'),
  task('b', 'Draft the README'),
]
const lists: List[] = [
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

function setup(over: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const props = {
    commands,
    tasks,
    lists,
    canSetPriority: false,
    onSelectTask: vi.fn(),
    onFilterList: vi.fn(),
    onSetPriority: vi.fn(),
    onCreateTask: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  const view = render(<CommandPalette {...props} />)
  const input = screen.getByRole('combobox', {
    name: 'Type a command or search',
  })
  return { ...props, ...view, input }
}

const activeText = (input: HTMLElement) => {
  const id = input.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id)?.textContent : null
}

beforeEach(() => sessionStorage.clear())

describe('CommandPalette', () => {
  it('opens with focus in the combobox and the list expanded', () => {
    const { input } = setup()
    expect(document.activeElement).toBe(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Results' })).toBeInTheDocument()
  })

  it('lists commands by group, hides hidden ones, and shows a few tasks', () => {
    setup()
    expect(screen.getByRole('option', { name: /New task/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Move down/ })).toBeNull()
    expect(screen.getByRole('group', { name: 'Navigate' })).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('group', { name: 'Matching tasks' }),
      ).getAllByRole('option'),
    ).toHaveLength(2)
  })

  it('moves the highlight with the arrows and never moves focus', () => {
    const { input } = setup()
    expect(activeText(input)).toMatch(/New task/)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(activeText(input)).toMatch(/Go to Inbox/)
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(activeText(input)).toMatch(/New task/)
  })

  it('wraps at both ends', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(activeText(input)).toMatch(/Draft the README/)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(activeText(input)).toMatch(/New task/)
  })

  it('runs the highlighted command on Enter and closes', () => {
    const { input, onClose } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(commands[1]!.run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('⌘↵ runs and keeps the palette open', () => {
    const { input, onClose } = setup()
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(commands[0]!.run).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('filters as you type, fuzzily', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'inbx' } })
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringMatching(/Go to Inbox/),
    ])
    expect(activeText(input)).toMatch(/Go to Inbox/)
  })

  it('marks a command that needs a selection as disabled, and will not run it', () => {
    const { input } = setup()
    const del = screen.getByRole('option', { name: /Delete/ })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    expect(del).toHaveTextContent('Select a task first')

    fireEvent.change(input, { target: { value: 'delete' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(commands[3]!.run).not.toHaveBeenCalled()
  })

  it('offers to create the task when nothing matches, and Enter does', () => {
    const { input, onCreateTask, onClose } = setup()
    fireEvent.change(input, { target: { value: 'buy more coffee' } })
    expect(
      screen.getByText('No match for “buy more coffee”.'),
    ).toBeInTheDocument()
    const create = screen.getByRole('option', { name: /Create a task called/ })
    expect(create).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreateTask).toHaveBeenCalledWith('buy more coffee')
    expect(onClose).toHaveBeenCalled()
  })

  /* Each scope gets its own render. Running a command CLOSES the dialog, and
     everything inside a closed dialog is correctly inaccessible -- so a test
     that ran one and kept querying would be asserting against a shut drawer. */
  it('> narrows to commands, leaving task matches out', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: '> inbox' } })
    expect(screen.queryByRole('group', { name: 'Matching tasks' })).toBeNull()
    expect(
      screen.getByRole('option', { name: /Go to Inbox/ }),
    ).toBeInTheDocument()
  })

  it('# filters by the list you pick', () => {
    const { input, onFilterList } = setup()
    fireEvent.change(input, { target: { value: '# doc' } })
    expect(screen.getByRole('group', { name: 'Lists' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFilterList).toHaveBeenCalledWith(lists[0]!.id)
  })

  it('! offers the three priorities, inert without a selected task', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: '!' } })
    const priority = screen.getByRole('group', { name: 'Priority' })
    expect(within(priority).getAllByRole('option')).toHaveLength(3)
    expect(within(priority).getAllByRole('option')[0]).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('sets the priority when a task is selected', () => {
    const { input, onSetPriority } = setup({ canSetPriority: true })
    fireEvent.change(input, { target: { value: '! urgent' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSetPriority).toHaveBeenCalledWith('p1')
  })

  it('⇥ cycles the scope prefix', () => {
    const { input } = setup()
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input).toHaveValue('> ')
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input).toHaveValue('# ')
  })

  it('selects a task from the task scope', () => {
    const { input, onSelectTask } = setup()
    fireEvent.change(input, { target: { value: 'readme' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelectTask).toHaveBeenCalledWith('b')
  })

  it('remembers what you ran and surfaces it first next time', () => {
    const first = setup()
    fireEvent.change(first.input, { target: { value: 'show all' } })
    fireEvent.keyDown(first.input, { key: 'Enter' })
    first.unmount()

    const second = setup()
    expect(screen.getByRole('group', { name: 'Recent' })).toBeInTheDocument()
    expect(activeText(second.input)).toMatch(/Show all statuses/)
  })

  it('closes on Escape and returns focus to where it came from', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { input, onClose, unmount } = setup()
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('a click runs the row without stealing focus from the input', () => {
    const { input, onClose } = setup()
    fireEvent.mouseDown(screen.getByRole('option', { name: /Go to Inbox/ }))
    expect(commands[1]!.run).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('has no accessibility violations', async () => {
    const { container } = setup()
    expect(await axe(container)).toHaveNoViolations()
  })
})
