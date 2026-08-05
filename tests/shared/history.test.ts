import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT } from '@shared/constants'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from '@shared/history'

describe('createHistory', () => {
  it('starts with no past and no future', () => {
    expect(createHistory('a')).toEqual({ past: [], present: 'a', future: [] })
  })
})

describe('pushHistory', () => {
  it('moves the old present into the past', () => {
    expect(pushHistory(createHistory('a'), 'b')).toEqual({
      past: ['a'], present: 'b', future: [],
    })
  })

  it('clears the redo stack on a new edit', () => {
    const branched = undo(pushHistory(createHistory('a'), 'b'))
    expect(canRedo(branched)).toBe(true)
    expect(canRedo(pushHistory(branched, 'c'))).toBe(false)
  })

  it('caps the past at HISTORY_LIMIT, discarding oldest first', () => {
    let history = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) history = pushHistory(history, i)
    // States 0..60 exist; 60 is the present, so the past holds 0..59 capped to
    // its last HISTORY_LIMIT entries, making 10 the oldest survivor.
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]).toBe(10)
    expect(history.past[history.past.length - 1]).toBe(HISTORY_LIMIT + 9)
  })

  it('does not mutate the input history', () => {
    const original = createHistory('a')
    pushHistory(original, 'b')
    expect(original).toEqual({ past: [], present: 'a', future: [] })
  })
})

describe('undo', () => {
  it('restores the previous present', () => {
    expect(undo(pushHistory(createHistory('a'), 'b'))).toEqual({
      past: [], present: 'a', future: ['b'],
    })
  })

  it('is a no-op with an empty past', () => {
    const history = createHistory('a')
    expect(undo(history)).toEqual(history)
  })
})

describe('redo', () => {
  it('reapplies an undone state', () => {
    const history = pushHistory(createHistory('a'), 'b')
    expect(redo(undo(history))).toEqual(history)
  })

  it('is a no-op with an empty future', () => {
    const history = createHistory('a')
    expect(redo(history)).toEqual(history)
  })
})

describe('canUndo / canRedo', () => {
  it('reports false on a fresh history', () => {
    const history = createHistory('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('reports true once an edit has been pushed', () => {
    expect(canUndo(pushHistory(createHistory('a'), 'b'))).toBe(true)
  })
})
