import { describe, expect, it } from 'vitest'
import {
  isTrialActive,
  parseTrialOverride,
  TRIAL_DAYS,
  TRIAL_MS,
  trialDaysLeft,
  trialEndsAt,
} from '../../../src/shared/license/trial'

const START = Date.parse('2026-08-01T00:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

describe('trialEndsAt', () => {
  it('runs for the advertised number of days', () => {
    expect(trialEndsAt(START, START)).toBe(START + TRIAL_DAYS * DAY_MS)
    expect(TRIAL_MS).toBe(TRIAL_DAYS * DAY_MS)
  })

  it('clamps a start in the future to now, so a wrong clock costs nothing', () => {
    const now = START - 5 * DAY_MS
    expect(trialEndsAt(START, now)).toBe(now + TRIAL_MS)
  })
})

describe('trialDaysLeft', () => {
  const endsAt = trialEndsAt(START, START)

  it('counts the full term on the first day', () => {
    expect(trialDaysLeft(endsAt, START)).toBe(TRIAL_DAYS)
  })

  it('rounds a part-day up, so the last day never reads as zero', () => {
    expect(trialDaysLeft(endsAt, endsAt - 1)).toBe(1)
    expect(trialDaysLeft(endsAt, endsAt - DAY_MS - 1)).toBe(2)
  })

  it('never goes negative once the trial is over', () => {
    expect(trialDaysLeft(endsAt, endsAt)).toBe(0)
    expect(trialDaysLeft(endsAt, endsAt + 30 * DAY_MS)).toBe(0)
  })
})

describe('isTrialActive', () => {
  const endsAt = trialEndsAt(START, START)

  it('holds right up to the final instant', () => {
    expect(isTrialActive(endsAt, START)).toBe(true)
    expect(isTrialActive(endsAt, endsAt - 1)).toBe(true)
  })

  it('ends on the instant itself', () => {
    expect(isTrialActive(endsAt, endsAt)).toBe(false)
  })
})

describe('parseTrialOverride', () => {
  it('reads a day count back from now, with or without the suffix', () => {
    expect(parseTrialOverride('-31d', START)).toBe(START - 31 * DAY_MS)
    expect(parseTrialOverride('-31', START)).toBe(START - 31 * DAY_MS)
    expect(parseTrialOverride('  -31d  ', START)).toBe(START - 31 * DAY_MS)
  })

  it('puts a day count past the trial length outside the trial', () => {
    const startedAt = parseTrialOverride(`-${TRIAL_DAYS + 1}d`, START)!
    expect(isTrialActive(trialEndsAt(startedAt, START), START)).toBe(false)
  })

  it('reads an ISO instant', () => {
    expect(parseTrialOverride('2026-08-01T00:00:00.000Z', START)).toBe(START)
  })

  it('refuses anything it cannot read, so a typo cannot grant a fresh trial', () => {
    for (const bad of ['', '   ', 'yesterday', '31d', '-', '--31d', '-3.5d']) {
      expect(parseTrialOverride(bad, START)).toBeNull()
    }
  })

  it('reads zero days as now', () => {
    expect(parseTrialOverride('-0', START)).toBe(START)
  })
})
