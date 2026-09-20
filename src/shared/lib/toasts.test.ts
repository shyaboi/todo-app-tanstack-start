import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TOAST_MS,
  clearToasts,
  dismissToast,
  pushToast,
  useToasts,
} from './toasts'
import { renderHook, act } from '@testing-library/react'

beforeEach(() => {
  vi.useFakeTimers()
  clearToasts()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('toasts', () => {
  it('a pushed toast is seen by every subscriber, and dismissal removes it', () => {
    const { result } = renderHook(() => useToasts())
    expect(result.current).toEqual([])

    let id = ''
    act(() => {
      id = pushToast({ message: 'Could not save.', errorId: 'abc123' })
    })
    expect(result.current).toHaveLength(1)
    expect(result.current[0]).toMatchObject({
      id,
      message: 'Could not save.',
      errorId: 'abc123',
    })

    act(() => dismissToast(id))
    expect(result.current).toEqual([])
  })

  it('expires on its own after the window, and not before', () => {
    const { result } = renderHook(() => useToasts())
    act(() => {
      pushToast({ message: 'x' })
    })
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1)
    })
    expect(result.current).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toEqual([])
  })

  it('keeps a stable reference while nothing changes, so renders stay cheap', () => {
    const { result, rerender } = renderHook(() => useToasts())
    const before = result.current
    rerender()
    expect(result.current).toBe(before)
    act(() => {
      pushToast({ message: 'x' })
    })
    expect(result.current).not.toBe(before)
  })

  it('dismissing twice is harmless', () => {
    let id = ''
    act(() => {
      id = pushToast({ message: 'x' })
    })
    act(() => dismissToast(id))
    expect(() => dismissToast(id)).not.toThrow()
  })
})
