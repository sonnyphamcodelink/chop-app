/**
 * What Chop says about itself. Deliberately thin: a version, an OS, a display
 * count, and which side of the licence line the user is on. No key, no email,
 * no paths — the "What's included" disclosure has to stay short enough to read.
 */
import { app, screen } from 'electron'
import { release } from 'node:os'
import type { FeedbackDiagnostics } from '@shared/feedback/types'
import { currentLicenseStatus } from '../license'

/** The licence kind, flattened to a word. Claims never travel with feedback. */
function licenseWord(): string {
  switch (currentLicenseStatus().kind) {
    case 'licensed':
      return 'licensed'
    case 'expired':
      return 'licence expired'
    case 'invalid':
      return 'licence unreadable'
    case 'trial':
      return 'trial'
    case 'trial-expired':
      return 'trial ended'
  }
}

/** The app version, OS version, and CPU architecture — used by both feedback and usage. */
export function collectSystemInfo(): { appVersion: string; osVersion: string; arch: string } {
  return {
    appVersion: app.getVersion(),
    osVersion: release(),
    arch: process.arch,
  }
}

export function collectDiagnostics(): FeedbackDiagnostics {
  const { appVersion, osVersion, arch } = collectSystemInfo()
  return {
    appVersion,
    platform: process.platform,
    osVersion,
    arch,
    // Reading displays needs the app ready, which it is by the time a settings
    // window exists. A failure here must not cost the user their note.
    displayCount: safeDisplayCount(),
    license: licenseWord(),
  }
}

function safeDisplayCount(): number {
  try {
    return screen.getAllDisplays().length
  } catch {
    return 0
  }
}
