import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSelection } from './useSelection'

let rows: HTMLElement[] = []
function mountRows(ids: string[]) {
  for (const id of ids) {
    const li = document.createElement('li')
    li.tabIndex = -1
    li.setAttribute('data-task-row', id)
    document.body.appendChild(li)
    rows.push(li)
  }
}
afterEach(() => {
  for (const r of rows) r.remove()
  rows = []
})

describe('useSelection', () => {
  it('starts with nothing selected', () => {
    const { result } = renderHook(() => useSelection(['a', 'b', 'c']))
    expect(result.current.selectedId).toBeNull()
  })

  it('moves down into the first row, and up into the last', () => {
    mountRows(['a', 'b', 'c'])
    const { result } = renderHook(() => useSelection(['a', 'b', 'c']))

    act(() => result.current.move(1))
    expect(result.current.selectedId).toBe('a')

    act(() => result.current.clear())
    act(() => result.current.move(-1))
    expect(result.current.selectedId).toBe('c')
  })

  it('walks the list and stops at the ends rather than wrapping', () => {
    mountRows(['a', 'b'])
    const { result } = renderHook(() => useSelection(['a', 'b']))
    act(() => result.current.move(1))
    act(() => result.current.move(1))
    act(() => result.current.move(1))
    expect(result.current.selectedId).toBe('b')
    act(() => result.current.move(-1))
    act(() => result.current.move(-1))
    expect(result.current.selectedId).toBe('a')
  })

  it('really moves DOM focus to the row', () => {
    mountRows(['a', 'b'])
    const { result } = renderHook(() => useSelection(['a', 'b']))
    act(() => result.current.move(1))
    expect(document.activeElement).toBe(rows[0])
    act(() => result.current.move(1))
    expect(document.activeElement).toBe(rows[1])
  })

  it('drops the selection when that row leaves the list, with no cleanup step', () => {
    mountRows(['a', 'b'])
    const { result, rerender } = renderHook(({ ids }) => useSelection(ids), {
      initialProps: { ids: ['a', 'b'] },
    })
    act(() => result.current.select('b'))
    expect(result.current.selectedId).toBe('b')

    // Deleted, or filtered out: the id is simply no longer in the order.
    rerender({ ids: ['a'] })
    expect(result.current.selectedId).toBeNull()
  })

  it('does nothing on an empty list', () => {
    const { result } = renderHook(() => useSelection([]))
    act(() => result.current.move(1))
    expect(result.current.selectedId).toBeNull()
  })
})
