export type Debounced<A extends unknown[]> = {
  (...args: A): void
  flush(): void
  cancel(): void
}

/** Trailing-edge debounce with flush, so a pending save can be forced on close. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  const debounced = ((...args: A): void => {
    pending = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      const args_ = pending
      clear()
      if (args_) fn(...args_)
    }, waitMs)
  }) as Debounced<A>

  debounced.flush = (): void => {
    const args = pending
    clear()
    if (args) fn(...args)
  }
  debounced.cancel = clear

  return debounced
}
