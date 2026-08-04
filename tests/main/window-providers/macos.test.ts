import { describe, expect, it } from 'vitest'
import { parseHelperOutput } from '../../../src/main/window-providers/macos'

describe('parseHelperOutput', () => {
  it('parses helper JSON into WindowRects preserving order', () => {
    const stdout = JSON.stringify([
      { id: 982, x: 1512, y: 30, width: 1857, height: 1050, app: 'Claude' },
      { id: 130, x: 0, y: 33, width: 1449, height: 949, app: 'Slack' },
    ])
    expect(parseHelperOutput(stdout)).toEqual([
      { id: 982, app: 'Claude', bounds: { x: 1512, y: 30, width: 1857, height: 1050 } },
      { id: 130, app: 'Slack', bounds: { x: 0, y: 33, width: 1449, height: 949 } },
    ])
  })

  it('returns an empty list for an empty array', () => {
    expect(parseHelperOutput('[]')).toEqual([])
  })

  it('skips entries with non-numeric geometry rather than throwing', () => {
    const stdout = JSON.stringify([
      { id: 1, x: 0, y: 0, width: 100, height: 100, app: 'Good' },
      { id: 2, x: 'nope', y: 0, width: 100, height: 100, app: 'Bad' },
    ])
    expect(parseHelperOutput(stdout).map((w) => w.id)).toEqual([1])
  })

  it('throws a descriptive error on malformed JSON', () => {
    expect(() => parseHelperOutput('not json')).toThrow(/window helper/i)
  })

  it('throws when the payload is not an array', () => {
    expect(() => parseHelperOutput('{"id":1}')).toThrow(/window helper/i)
  })
})
