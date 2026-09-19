import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Task } from './task.types'

/* The server functions are the network boundary; mocking them is what lets
   this assert the CACHE contract -- optimistic write, then rollback -- without
   a database in the loop. */
const updateTodo = vi.fn<(args: unknown) => Promise<Task>>()
const createTodo = vi.fn<(args: unknown) => Promise<Task>>()
const listTodos = vi.fn<(args: unknown) => Promise<Task[]>>()
vi.mock('./task.server', () => ({
  updateTodo: (args: unknown) => updateTodo(args),
  createTodo: (args: unknown) => createTodo(args),
  listTodos: (args: unknown) => listTodos(args),
  deleteTodo: vi.fn(),
}))

const { useUpdateTask, tasksQueryKey } = await import('./task.query')

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `task ${id}`,
  notes: null,
  status: 'todo',
  dueAt: null,
  priority: 'p2',
  listId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
})

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  const seed = [task('a'), task('b'), task('c')]
  queryClient.setQueryData(tasksQueryKey, seed)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper, seed }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUpdateTask', () => {
  it('writes the change to the cache before the server answers', async () => {
    const { queryClient, wrapper } = harness()
    // Never resolves: the cache is observed mid-flight, on purpose.
    updateTodo.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    result.current.mutate({ id: 'b', patch: { status: 'done' } })

    await waitFor(() => {
      const cached = queryClient.getQueryData<Task[]>(tasksQueryKey)
      expect(cached?.find((t) => t.id === 'b')?.status).toBe('done')
    })
  })

  it('restores the cache byte-for-byte when the server rejects', async () => {
    const { queryClient, wrapper, seed } = harness()
    const before = structuredClone(
      queryClient.getQueryData<Task[]>(tasksQueryKey),
    )
    updateTodo.mockRejectedValue(new Error('server said no'))

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    result.current.mutate({ id: 'b', patch: { status: 'done' } })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // The assertion the whole optimistic strategy rests on: after a failure the
    // cache is indistinguishable from before the attempt (Failure Check 2).
    expect(queryClient.getQueryData<Task[]>(tasksQueryKey)).toEqual(before)
    expect(queryClient.getQueryData<Task[]>(tasksQueryKey)).toEqual(seed)
  })

  it('reconciles with the server version, not the optimistic guess', async () => {
    const { queryClient, wrapper } = harness()
    // The server also bumps updatedAt -- the client must take its word.
    updateTodo.mockResolvedValue(
      task('b', { status: 'done', updatedAt: '2026-09-20T10:00:00.000Z' }),
    )

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    result.current.mutate({ id: 'b', patch: { status: 'done' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const updated = queryClient
      .getQueryData<Task[]>(tasksQueryKey)
      ?.find((t) => t.id === 'b')
    expect(updated?.updatedAt).toBe('2026-09-20T10:00:00.000Z')
  })

  it('leaves the other rows untouched', async () => {
    const { queryClient, wrapper } = harness()
    updateTodo.mockResolvedValue(task('b', { status: 'done' }))

    const { result } = renderHook(() => useUpdateTask(), { wrapper })
    result.current.mutate({ id: 'b', patch: { status: 'done' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const cached = queryClient.getQueryData<Task[]>(tasksQueryKey)
    expect(cached?.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(cached?.filter((t) => t.status === 'todo').map((t) => t.id)).toEqual(
      ['a', 'c'],
    )
  })
})
