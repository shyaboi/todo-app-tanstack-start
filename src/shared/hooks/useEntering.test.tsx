import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useEntering, resetPaintedForTests } from './useEntering'

function Probe() {
  return <span data-testid="probe" data-enter={useEntering() || undefined} />
}

/** Runs the frame callback the hook schedules, as the browser would. */
async function paint() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

describe('useEntering', () => {
  beforeEach(resetPaintedForTests)

  it('says no on the first paint, so nothing animates on load', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe')).not.toHaveAttribute('data-enter')
  })

  it('says yes to anything mounted after the page has painted', async () => {
    render(<Probe />)
    await paint()
    render(<Probe />)
    expect(screen.getAllByTestId('probe')[1]).toHaveAttribute('data-enter')
  })

  it('does not change its answer when the element re-renders', async () => {
    const { rerender } = render(<Probe />)
    await paint()
    rerender(<Probe />)
    // Still the element that was there at load: it must not animate now.
    expect(screen.getByTestId('probe')).not.toHaveAttribute('data-enter')
  })
})
