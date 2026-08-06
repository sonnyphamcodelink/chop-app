import { describe, expect, it } from 'vitest'
import { type DisplayInfo, physicalSize } from '@shared/coords'
import {
  groupDisplaysBySize,
  matchSourceToDisplay,
} from '../../../src/main/capture/source-match'

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

describe('groupDisplaysBySize', () => {
  const retina: DisplayInfo = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    scaleFactor: 2,
  }
  const external: DisplayInfo = {
    id: 2,
    bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  }
  const twinRetina: DisplayInfo = { ...retina, id: 3, bounds: { ...retina.bounds, x: -1512 } }

  it('puts a single display in one group at its own framebuffer size', () => {
    const groups = groupDisplaysBySize([retina], physicalSize)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.size).toEqual({ width: 3024, height: 1964 })
    expect(groups[0]!.displays).toEqual([retina])
  })

  it('separates displays with different framebuffer sizes', () => {
    // One shared grab would letterbox the 1920x1080 panel into the 3024x1964
    // box and resample it; each size has to be requested on its own.
    const groups = groupDisplaysBySize([retina, external], physicalSize)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.size)).toEqual([
      { width: 3024, height: 1964 },
      { width: 1920, height: 1080 },
    ])
  })

  it('shares one group between identical displays, so one grab covers both', () => {
    const groups = groupDisplaysBySize([retina, twinRetina], physicalSize)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.displays.map((display) => display.id)).toEqual([1, 3])
  })

  it('returns no groups for no displays', () => {
    expect(groupDisplaysBySize([], physicalSize)).toEqual([])
  })
})
