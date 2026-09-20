import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput, SEARCH_DEBOUNCE_MS } from './SearchInput'

/* Fake timers, so the debounce is asserted by the clock rather than by
   waiting. The component is controlled and never navigates, which is what
   makes it testable with a plain mock. */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(value = '') {
  const onChange = vi.fn()
  const view = render(<SearchInput value={value} onChange={onChange} />)
  const input = screen.getByRole('searchbox', { name: 'Search tasks' })
  return { onChange, input, ...view }
}

/** Advances the fake clock inside act, as React 19 asks. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('SearchInput', () => {
  it('has a real label, not just a placeholder', () => {
    setup()
    expect(screen.getByLabelText('Search tasks')).toBeInstanceOf(
      HTMLInputElement,
    )
  })

  it('reports once after typing pauses, not on every keystroke', () => {
    const { onChange, input } = setup()

    fireEvent.change(input, { target: { value: 'f' } })
    fireEvent.change(input, { target: { value: 'fo' } })
    fireEvent.change(input, { target: { value: 'foc' } })
    expect(onChange).not.toHaveBeenCalled()

    tick(SEARCH_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('foc')
  })

  it('cancels a pending report when another keystroke arrives', () => {
    const { onChange, input } = setup()

    fireEvent.change(input, { target: { value: 'a' } })
    tick(SEARCH_DEBOUNCE_MS - 10)
    fireEvent.change(input, { target: { value: 'ab' } })
    tick(SEARCH_DEBOUNCE_MS - 10)

    // Neither timer has completed on its own schedule.
    expect(onChange).not.toHaveBeenCalled()

    tick(10)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ab')
  })

  it('does not report a value it was given back', () => {
    // The parent navigates to the reported q, which comes back as `value`.
    // That must not trigger a second report and an infinite loop.
    const { onChange, input, rerender } = setup()
    fireEvent.change(input, { target: { value: 'focus' } })
    tick(SEARCH_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)

    rerender(<SearchInput value="focus" onChange={onChange} />)
    tick(SEARCH_DEBOUNCE_MS * 2)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('follows an external change to the value, such as Back or Clear filters', () => {
    const { onChange, input, rerender } = setup('focus')
    expect(input).toHaveValue('focus')

    rerender(<SearchInput value="" onChange={onChange} />)
    expect(input).toHaveValue('')
    // Adopting the URL's value is not a report; nothing was typed.
    tick(SEARCH_DEBOUNCE_MS * 2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps keystrokes typed after a debounced report landed', () => {
    // The race: "foc" is reported and comes back as value while the box already
    // says "focus". The box must not snap back to "foc".
    const { onChange, input, rerender } = setup()
    fireEvent.change(input, { target: { value: 'foc' } })
    tick(SEARCH_DEBOUNCE_MS)
    expect(onChange).toHaveBeenLastCalledWith('foc')

    fireEvent.change(input, { target: { value: 'focus' } })
    rerender(<SearchInput value="foc" onChange={onChange} />)
    expect(input).toHaveValue('focus')
  })

  it('escape clears the field and reports immediately, without waiting', () => {
    const { onChange, input } = setup('focus')
    act(() => input.focus())

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
    expect(onChange).toHaveBeenCalledWith('')
    expect(document.activeElement).toBe(input)
  })

  it('does not snap back after escape while the parent has yet to re-render', () => {
    // Escape reports '' at once; the parent's `value` is still the old query
    // for a render or two. A stale prop must not be mistaken for Back.
    const { onChange, input, rerender } = setup('focus')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')

    rerender(<SearchInput value="focus" onChange={onChange} />)
    expect(input).toHaveValue('')

    // And when the parent catches up, nothing changes and nothing re-reports.
    rerender(<SearchInput value="" onChange={onChange} />)
    expect(input).toHaveValue('')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('escape on an empty field leaves the field instead', () => {
    const { input } = setup('')
    act(() => input.focus())
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.activeElement).not.toBe(input)
  })

  it('slash focuses the search from anywhere on the page', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const { input } = setup()
    expect(document.activeElement).not.toBe(input)

    await user.keyboard('/')
    expect(document.activeElement).toBe(input)
    // The slash itself must not land in the box.
    expect(input).toHaveValue('')
  })

  it('slash inside another text field is just a slash', () => {
    setup()
    const other = document.createElement('input')
    document.body.appendChild(other)
    act(() => other.focus())

    fireEvent.keyDown(other, { key: '/' })
    expect(document.activeElement).toBe(other)
    other.remove()
  })
})
