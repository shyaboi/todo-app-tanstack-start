import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import type { Task } from '../task.types'

/* The server boundary is mocked so this asserts the panel's contract -- what
   it sends, and when -- without a database in the loop. The list fetch
   answers from the cache itself, so a refetch after a mutation settles is a
   no-op rather than a hole. */
const updateTodo = vi.fn<(args: unknown) => Promise<Task>>()
let client: QueryClient
const DOCS = {
  id: '64b0c0ffee0ddba11ad00002',
  name: 'Docs',
  createdAt: '2026-09-01T00:00:00.000Z',
}
vi.mock('~/features/lists/list.server', () => ({
  listLists: () => Promise.resolve([DOCS]),
  createList: vi.fn(),
  renameList: vi.fn(),
  deleteList: vi.fn(),
}))
vi.mock('../task.server', () => ({
  updateTodo: (args: unknown) => updateTodo(args),
  listTodos: () => Promise.resolve(client.getQueryData(['tasks']) ?? []),
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  restoreTodo: vi.fn(),
}))

const { TaskDetailPanel } = await import('./TaskDetailPanel')
const { tasksQuery, tasksQueryKey } = await import('../task.query')
const { listsQueryKey } = await import('~/features/lists/list.query')

const task: Task = {
  id: '64b0c0ffee0ddba11ad0c0de',
  title: 'Draft the README',
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: DOCS.id,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

/* The panel is rendered the way the route renders it: with the task read from
   the cache, so an optimistic write -- or its rollback -- flows back into the
   props. A fixed prop would hide exactly the behaviour under test. */
function Harness({
  onClose,
  initialFocus,
}: {
  onClose: () => void
  initialFocus?: 'dueAt'
}) {
  const { data } = useQuery(tasksQuery)
  return (
    <TaskDetailPanel
      task={data![0]!}
      onClose={onClose}
      initialFocus={initialFocus}
    />
  )
}

function setup(over: Partial<Task> = {}, initialFocus?: 'dueAt') {
  client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Infinity },
    },
  })
  client.setQueryData(tasksQueryKey, [{ ...task, ...over }])
  client.setQueryData(listsQueryKey, [DOCS])
  const onClose = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <Harness onClose={onClose} initialFocus={initialFocus} />
    </QueryClientProvider>,
  )
  return { ...view, onClose, queryClient: client }
}

/* A server function is called as `fn({ data })`; what the panel decided to
   send is the `data`. */
const sent = () =>
  updateTodo.mock.calls.map((c) => (c[0] as { data: unknown }).data)

beforeEach(() => {
  vi.clearAllMocks()
  updateTodo.mockImplementation((args: unknown) => {
    const { data } = args as { data: { patch: Partial<Task> } }
    return Promise.resolve({ ...task, ...data.patch })
  })
})

describe('TaskDetailPanel', () => {
  it('shows every field with the task’s values, and takes focus on open', () => {
    setup({ notes: 'hello', dueAt: '2026-09-15T16:00:00.000Z' })
    expect(screen.getByLabelText('Title')).toHaveValue('Draft the README')
    expect(screen.getByLabelText('Status')).toHaveValue('todo')
    expect(screen.getByLabelText('Priority')).toHaveValue('p2')
    expect(screen.getByLabelText('List')).toHaveValue(DOCS.id)
    expect(screen.getByLabelText('Notes')).toHaveValue('hello')
    expect(screen.getByLabelText('Due')).not.toHaveValue('')
    expect(document.activeElement).toBe(
      screen.getByRole('complementary', { name: 'Task details' }),
    )
  })

  it('the D shortcut lands on the due field instead', () => {
    setup({}, 'dueAt')
    expect(document.activeElement).toBe(screen.getByLabelText('Due'))
  })

  it('a select saves the moment it changes, one field per patch', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'doing' },
    })
    await waitFor(() =>
      expect(sent()).toEqual([{ id: task.id, patch: { status: 'doing' } }]),
    )
    fireEvent.change(screen.getByLabelText('List'), { target: { value: '' } })
    await waitFor(() =>
      expect(sent()[1]).toEqual({ id: task.id, patch: { listId: null } }),
    )
  })

  it('a text field saves on blur only when it changed', async () => {
    setup()
    const title = screen.getByLabelText('Title')
    fireEvent.blur(title)
    expect(updateTodo).not.toHaveBeenCalled()

    fireEvent.change(title, { target: { value: 'Draft the README properly' } })
    fireEvent.blur(title)
    await waitFor(() =>
      expect(sent()).toEqual([
        { id: task.id, patch: { title: 'Draft the README properly' } },
      ]),
    )
    await screen.findByText('Saved just now')
  })

  it('Enter commits a single-line field; Escape reverts a dirty one', async () => {
    const { onClose } = setup()
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: 'changed' } })
    fireEvent.keyDown(title, { key: 'Escape' })
    expect(title).toHaveValue('Draft the README')
    expect(onClose).not.toHaveBeenCalled()
    expect(updateTodo).not.toHaveBeenCalled()

    fireEvent.change(title, { target: { value: 'via enter' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() =>
      expect(sent()).toEqual([{ id: task.id, patch: { title: 'via enter' } }]),
    )
  })

  it('Escape with nothing to revert closes the panel', () => {
    const { onClose } = setup()
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('refuses an invalid title with the server’s own message, and sends nothing', () => {
    setup()
    const title = screen.getByLabelText('Title')
    fireEvent.change(title, { target: { value: '   ' } })
    fireEvent.blur(title)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Give the task a title.',
    )
    expect(updateTodo).not.toHaveBeenCalled()
  })

  it('the due field speaks local time and sends an exact instant', async () => {
    setup()
    const due = screen.getByLabelText('Due')
    fireEvent.change(due, { target: { value: '2026-09-20T09:30' } })
    fireEvent.blur(due)
    await waitFor(() => expect(sent()).toHaveLength(1))
    const { patch } = sent()[0] as { patch: { dueAt: string } }
    expect(new Date(patch.dueAt).toISOString()).toBe(patch.dueAt)
    expect(new Date(patch.dueAt).getHours()).toBe(9)
    expect(new Date(patch.dueAt).getMinutes()).toBe(30)

    fireEvent.change(due, { target: { value: '' } })
    fireEvent.blur(due)
    await waitFor(() =>
      expect(sent()[1]).toEqual({ id: task.id, patch: { dueAt: null } }),
    )
  })

  it('a failed save says so on that field and keeps the draft for a retry', async () => {
    updateTodo.mockRejectedValue(new Error('nope'))
    setup()
    const notes = screen.getByLabelText('Notes')
    fireEvent.change(notes, { target: { value: 'keep me' } })
    fireEvent.blur(notes)
    await screen.findByText('Could not save. Leave the field again to retry.')
    expect(notes).toHaveValue('keep me')
  })

  it('has no accessibility violations', async () => {
    const { container } = setup({ notes: 'a note' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
