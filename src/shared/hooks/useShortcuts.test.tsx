import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, fireEvent, act } from '@testing-library/react'
import { CHORD_TIMEOUT_MS, useShortcuts } from './useShortcuts'
import type { Command } from '../lib/commands'

/* jsdom's user agent is not a Mac, so the platform resolves to 'other' and
   ⌘ means Ctrl throughout these tests -- which is also what CI is. */

function command(
  over: Partial<Command> & { id: string; keys: string },
): Command {
  return { label: over.id, group: 'Tasks', run: vi.fn(), ...over }
}

const press = (
  target: Element | Document,
  key: string,
  mods: Partial<{
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
    altKey: boolean
  }> = {},
) => fireEvent.keyDown(target, { key, ...mods })

let scratch: HTMLElement[] = []
function mount(tag: string, props: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v)
  document.body.appendChild(el)
  scratch.push(el)
  return el
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  for (const el of scratch) el.remove()
  scratch = []
})

describe('useShortcuts', () => {
  it('runs a single-key command from the body', () => {
    const n = command({ id: 'new', keys: 'N' })
    renderHook(() => useShortcuts([n], false))
    press(document.body, 'n')
    expect(n.run).toHaveBeenCalledTimes(1)
  })

  it('reads ⌘ as Ctrl on this platform', () => {
    const k = command({ id: 'palette', keys: '⌘K' })
    renderHook(() => useShortcuts([k], false))
    press(document.body, 'k')
    expect(k.run).not.toHaveBeenCalled()
    press(document.body, 'k', { ctrlKey: true })
    expect(k.run).toHaveBeenCalledTimes(1)
  })

  it('stays out of text fields, except for Escape and ⌘K', () => {
    const n = command({ id: 'new', keys: 'N' })
    const esc = command({ id: 'esc', keys: 'esc' })
    const k = command({ id: 'palette', keys: '⌘K' })
    renderHook(() => useShortcuts([n, esc, k], false))

    const input = mount('input')
    press(input, 'n')
    expect(n.run).not.toHaveBeenCalled()

    press(input, 'Escape')
    expect(esc.run).toHaveBeenCalledTimes(1)
    press(input, 'k', { ctrlKey: true })
    expect(k.run).toHaveBeenCalledTimes(1)
  })

  it('leaves Space and Enter to a focused button, but lets arrows through', () => {
    const space = command({ id: 'advance', keys: 'Space' })
    const down = command({ id: 'down', keys: '↓' })
    renderHook(() => useShortcuts([space, down], false))

    const button = mount('button')
    press(button, ' ')
    expect(space.run).not.toHaveBeenCalled()
    press(button, 'ArrowDown')
    expect(down.run).toHaveBeenCalledTimes(1)
  })

  it('does nothing while a native dialog is open', () => {
    const n = command({ id: 'new', keys: 'N' })
    renderHook(() => useShortcuts([n], false))
    mount('dialog', { open: '' })
    press(document.body, 'n')
    expect(n.run).not.toHaveBeenCalled()
  })

  it('honours a two-key chord', () => {
    const inbox = command({ id: 'inbox', keys: 'G I' })
    const today = command({ id: 'today', keys: 'G T' })
    renderHook(() => useShortcuts([inbox, today], false))

    press(document.body, 'g')
    expect(inbox.run).not.toHaveBeenCalled()
    press(document.body, 't')
    expect(today.run).toHaveBeenCalledTimes(1)
    expect(inbox.run).not.toHaveBeenCalled()
  })

  it('disarms a chord after the timeout', () => {
    const inbox = command({ id: 'inbox', keys: 'G I' })
    renderHook(() => useShortcuts([inbox], false))

    press(document.body, 'g')
    act(() => {
      vi.advanceTimersByTime(CHORD_TIMEOUT_MS + 1)
    })
    press(document.body, 'i')
    expect(inbox.run).not.toHaveBeenCalled()
  })

  it('does not let a single-key binding fire as the second step of a chord', () => {
    // "I" alone is not bound; after "G" it must complete the chord, and a
    // stray single-key "G" binding must not swallow the first step either.
    const inbox = command({ id: 'inbox', keys: 'G I' })
    renderHook(() => useShortcuts([inbox], false))
    press(document.body, 'i')
    expect(inbox.run).not.toHaveBeenCalled()
  })

  it('makes number keys contextual: status with a selection, filter without', () => {
    const setStatus = command({ id: 'set', keys: '1', when: 'selection' })
    const filter = command({ id: 'filter', keys: '1', when: 'no-selection' })

    const { rerender } = renderHook(
      ({ hasSelection }) => useShortcuts([setStatus, filter], hasSelection),
      { initialProps: { hasSelection: false } },
    )
    press(document.body, '1')
    expect(filter.run).toHaveBeenCalledTimes(1)
    expect(setStatus.run).not.toHaveBeenCalled()

    rerender({ hasSelection: true })
    press(document.body, '1')
    expect(setStatus.run).toHaveBeenCalledTimes(1)
    expect(filter.run).toHaveBeenCalledTimes(1)
  })

  it('skips a disabled command', () => {
    const del = command({ id: 'delete', keys: '⌘⌫', enabled: false })
    renderHook(() => useShortcuts([del], true))
    press(document.body, 'Backspace', { ctrlKey: true })
    expect(del.run).not.toHaveBeenCalled()
  })

  it('does not fire an unmodified binding when a modifier is held', () => {
    // Ctrl+N is the browser's new window; it is not "new task".
    const n = command({ id: 'new', keys: 'N' })
    renderHook(() => useShortcuts([n], false))
    press(document.body, 'n', { ctrlKey: true })
    expect(n.run).not.toHaveBeenCalled()
  })

  it('respects a handler that already claimed the event', () => {
    const esc = command({ id: 'esc', keys: 'esc' })
    renderHook(() => useShortcuts([esc], false))
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()
    document.body.dispatchEvent(event)
    expect(esc.run).not.toHaveBeenCalled()
  })
})
