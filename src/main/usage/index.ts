/**
 * Schedules daily usage reports.
 *
 * Two triggers:
 *   1. Startup — after STARTUP_DELAY_MS so it never competes with window
 *      creation or the first capture.
 *   2. A rolling 30-minute poll — the correct answer for a tray app that
 *      stays running across sleep, wake, timezone changes, and DST.  A
 *      midnight-aimed timer is not.
 *
 * A report is only sent when:
 *   – The local calendar day differs from `lastReportedDay`.
 *   – `usageEnabled` is true in settings.
 *   – The build is packaged (`app.isPackaged`), unless CHOP_USAGE_URL is set.
 *
 * Failures are silent to the user; counters accumulate until the next poll.
 */
import { app } from 'electron'
import { currentLicenseStatus } from '../license'
import { readLicenseFile } from '../license/license-store'
import { readSettings } from '../settings-store'
import { buildReport, isReportDue, localDay } from './report'
import { postUsage } from './send-usage'
import { initUsageStore, markReported, readUsage } from './usage-store'
import { USAGE_URL } from './endpoint'

const STARTUP_DELAY_MS = 30_000
const ROLLOVER_CHECK_MS = 30 * 60_000 // 30 minutes

let startupTimer: ReturnType<typeof setTimeout> | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null

async function maybeReport(): Promise<void> {
  const settings = readSettings()
  if (!settings.usageEnabled) return

  // Unpackaged builds never send unless a local Worker URL is configured.
  if (!app.isPackaged && !process.env.CHOP_USAGE_URL) return

  const file = readUsage()
  if (!file.deviceId) return // Not yet initialised — shouldn't happen in practice.

  const now = Date.now()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (!isReportDue(file.lastReportedDay, now, timeZone)) return

  const day = localDay(now, timeZone)
  const status = currentLicenseStatus()
  const licenseToken = readLicenseFile().key

  const report = buildReport(file, status, licenseToken, day)
  const result = await postUsage(report, USAGE_URL)

  if (result.ok) {
    markReported(day, new Date(now).toISOString())
  }
}

/**
 * Starts the reporting scheduler.  Must be called after `app.whenReady()` and
 * after `initUsageStore()` has completed.
 */
export function startUsageReporting(): void {
  // Guard against double-start (e.g. a test that calls it twice).
  if (startupTimer !== null || pollInterval !== null) return

  startupTimer = setTimeout(() => {
    void maybeReport()
    pollInterval = setInterval(() => void maybeReport(), ROLLOVER_CHECK_MS)
  }, STARTUP_DELAY_MS)
}

/** Cancels all pending timers.  Called on `will-quit` so nothing fires after exit. */
export function stopUsageReporting(): void {
  if (startupTimer !== null) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  if (pollInterval !== null) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

export { initUsageStore }
