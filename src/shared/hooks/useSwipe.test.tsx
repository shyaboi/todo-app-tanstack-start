import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SWIPE_THRESHOLD_PX, useSwipe } from './useSwipe'

function Row({ onSwipe }: { onSwipe: (d: 'left' | 'right') => void }) {
  const swipe = useSwipe(onSwipe)
  return (
    <div data-testid="row" data-dx={swipe.dx} {...swipe.handlers}>
      row
    </div>
  )
}

const touch = (x: number, y = 0) => ({
  pointerType: 'touch',
  pointerId: 1,
  clientX: x,
  clientY: y,
})

describe('useSwipe', () => {
  it('counts a long enough horizontal touch swipe, and reports its direction', () => {
    const onSwipe = vi.fn()
    render(<Row onSwipe={onSwipe} />)
    const row = screen.getByTestId('row')
    fireEvent.pointerDown(row, touch(10))
    fireEvent.pointerMove(row, touch(50))
    expect(row).toHaveAttribute('data-dx', '40')
    fireEvent.pointerUp(row, touch(10 + SWIPE_THRESHOLD_PX))
    expect(onSwipe).toHaveBeenCalledWith('right')
    expect(row).toHaveAttribute('data-dx', '0')

    fireEvent.pointerDown(row, touch(200))
    fireEvent.pointerUp(row, touch(200 - SWIPE_THRESHOLD_PX - 1))
    expect(onSwipe).toHaveBeenLastCalledWith('left')
  })

  it('ignores a short swipe, a mouse, and a finger that is scrolling', () => {
    const onSwipe = vi.fn()
    render(<Row onSwipe={onSwipe} />)
    const row = screen.getByTestId('row')

    fireEvent.pointerDown(row, touch(10))
    fireEvent.pointerUp(row, touch(10 + SWIPE_THRESHOLD_PX - 1))
    expect(onSwipe).not.toHaveBeenCalled()

    fireEvent.pointerDown(row, { ...touch(10), pointerType: 'mouse' })
    fireEvent.pointerUp(row, { ...touch(300), pointerType: 'mouse' })
    expect(onSwipe).not.toHaveBeenCalled()

    fireEvent.pointerDown(row, touch(10, 0))
    fireEvent.pointerMove(row, touch(12, 40)) // mostly vertical
    fireEvent.pointerUp(row, touch(300, 40))
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
