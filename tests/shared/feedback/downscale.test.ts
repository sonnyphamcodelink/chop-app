import { describe, expect, it } from 'vitest'
import {
  downscaleSize,
  downscaleSteps,
  MAX_IMAGE_EDGE,
} from '../../../src/shared/feedback/downscale'

describe('downscaleSize', () => {
  it('leaves an image already inside the box alone', () => {
    expect(downscaleSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('never upscales a small image', () => {
    expect(downscaleSize(10, 10)).toEqual({ width: 10, height: 10 })
  })

  it('fits the longest edge to the cap, whichever edge that is', () => {
    expect(downscaleSize(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 })
    expect(downscaleSize(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 })
  })

  it('keeps the aspect ratio of a Retina screenshot', () => {
    const size = downscaleSize(2880, 1800, 2000)
    expect(size.width).toBe(2000)
    expect(size.height).toBe(1250)
  })

  it('never rounds an edge away to nothing', () => {
    expect(downscaleSize(10000, 1, 100).height).toBe(1)
  })

  it('caps at the shared edge by default', () => {
    expect(downscaleSize(9000, 9000).width).toBe(MAX_IMAGE_EDGE)
  })
})

describe('downscaleSteps', () => {
  it('asks for no steps when nothing needs reducing', () => {
    expect(downscaleSteps({ width: 800, height: 600 }, { width: 800, height: 600 })).toEqual([])
  })

  it('goes straight there when the reduction is under half', () => {
    const steps = downscaleSteps({ width: 2880, height: 1800 }, { width: 2000, height: 1250 })
    expect(steps).toEqual([{ width: 2000, height: 1250 }])
  })

  it('halves its way down a large reduction rather than jumping', () => {
    const steps = downscaleSteps({ width: 8000, height: 8000 }, { width: 1000, height: 1000 })
    expect(steps.length).toBeGreaterThan(1)
    expect(steps.at(-1)).toEqual({ width: 1000, height: 1000 })
  })

  it('never reduces by more than half in any one step', () => {
    const from = { width: 8000, height: 6000 }
    const to = { width: 500, height: 375 }
    let previous = from
    for (const step of downscaleSteps(from, to)) {
      expect(step.width).toBeGreaterThanOrEqual(previous.width / 2)
      expect(step.height).toBeGreaterThanOrEqual(previous.height / 2)
      previous = step
    }
  })

  it('always finishes exactly on the target', () => {
    const to = { width: 333, height: 111 }
    expect(downscaleSteps({ width: 9999, height: 3333 }, to).at(-1)).toEqual(to)
  })

  it('does not repeat the target as a final no-op step', () => {
    const steps = downscaleSteps({ width: 4000, height: 4000 }, { width: 1000, height: 1000 })
    const last = steps.at(-1)
    expect(steps.filter((step) => step.width === last?.width)).toHaveLength(1)
  })
})
