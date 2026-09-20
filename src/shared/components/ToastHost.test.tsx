import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ToastHost } from './ToastHost'
import { clearToasts, pushToast } from '../lib/toasts'

beforeEach(() => clearToasts())

describe('ToastHost', () => {
  it('renders nothing until there is something to say', () => {
    const { container } = render(<ToastHost />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces a failure as an alert, with the server’s own message', () => {
    render(<ToastHost />)
    act(() => {
      pushToast({
        message:
          'Could not reach the database. Your change was rolled back — try again in a moment.',
        errorId: 'k3j4h5g6',
      })
    })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not reach the database')
    expect(alert).toHaveTextContent('k3j4h5g6')
  })

  it('Retry re-runs the write and takes the notice away', () => {
    const retry = vi.fn()
    render(<ToastHost />)
    act(() => {
      pushToast({ message: 'x', retry })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers no Retry when the write cannot be re-run from here', () => {
    render(<ToastHost />)
    act(() => {
      pushToast({ message: 'x' })
    })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('copies the error id and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ToastHost />)
    act(() => {
      pushToast({ message: 'x', errorId: 'abc' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy error id' }))
    expect(writeText).toHaveBeenCalledWith('abc')
    await screen.findByRole('button', { name: 'Copied' })
  })

  it('Dismiss removes only that notice', () => {
    render(<ToastHost />)
    act(() => {
      pushToast({ message: 'first' })
      pushToast({ message: 'second' })
    })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('second')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ToastHost />)
    act(() => {
      pushToast({ message: 'x', errorId: 'abc', retry: () => {} })
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})
