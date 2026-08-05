import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from '@shared/debounce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounce', () => {
  it('does not call the function before the delay elapses', () => {
    const spy = vi.fn()
    debounce(spy, 800)()
    vi.advanceTimersByTime(799)
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls the function once after the delay', () => {
    const spy = vi.fn()
    debounce(spy, 800)()
    vi.advanceTimersByTime(800)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('collapses rapid calls into one, using the latest arguments', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced('a')
    vi.advanceTimersByTime(400)
    debounced('b')
    vi.advanceTimersByTime(800)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('b')
  })

  it('flush runs a pending call immediately', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced('x')
    debounced.flush()
    expect(spy).toHaveBeenCalledWith('x')
  })

  it('flush does nothing when no call is pending', () => {
    const spy = vi.fn()
    debounce(spy, 800).flush()
    expect(spy).not.toHaveBeenCalled()
  })

  it('cancel discards a pending call', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(2000)
    expect(spy).not.toHaveBeenCalled()
  })
})
