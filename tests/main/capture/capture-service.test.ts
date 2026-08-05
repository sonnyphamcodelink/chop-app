import { describe, expect, it } from 'vitest'
import { matchSourceToDisplay } from '../../../src/main/capture/source-match'

type FakeSource = { id: string; display_id: string; name: string }

const sources: readonly FakeSource[] = [
  { id: 'screen:0:0', display_id: '69733382', name: 'Entire Screen' },
  { id: 'screen:1:0', display_id: '69733383', name: 'Display 2' },
]

describe('matchSourceToDisplay', () => {
  it('matches a source by display_id', () => {
    expect(matchSourceToDisplay(sources, 69733383)?.id).toBe('screen:1:0')
  })

  it('returns null when no source matches', () => {
    expect(matchSourceToDisplay(sources, 999)).toBeNull()
  })

  it('falls back to positional matching when display_id is empty', () => {
    const blank: readonly FakeSource[] = [
      { id: 'screen:0:0', display_id: '', name: 'Entire Screen' },
    ]
    expect(matchSourceToDisplay(blank, 12345, 0)?.id).toBe('screen:0:0')
  })

  it('returns null when the positional fallback is out of range', () => {
    expect(matchSourceToDisplay([], 12345, 3)).toBeNull()
  })
})
