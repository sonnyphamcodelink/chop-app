import { isNewerVersion } from '@shared/version'
import { installerAsset, type FeedResult, type ReleaseAsset } from './release-feed'

export type UpdateStatus =
  | { readonly kind: 'up-to-date'; readonly current: string }
  | {
      readonly kind: 'update-available'
      readonly current: string
      readonly tag: string
      readonly url: string
      readonly asset: ReleaseAsset
    }
  | { readonly kind: 'check-failed'; readonly reason: string }

export function updateStatus(
  current: string,
  feed: FeedResult,
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): UpdateStatus {
  if (!feed.ok) return { kind: 'check-failed', reason: feed.reason }

  const { tag, url } = feed.release
  if (!isNewerVersion(tag, current)) return { kind: 'up-to-date', current }
  const asset = installerAsset(feed.release, platform, arch)
  if (!asset) {
    return { kind: 'check-failed', reason: `No update is available for ${platform} ${arch}.` }
  }
  return { kind: 'update-available', current, tag, url, asset }
}

/** Structural match for Electron's MessageBoxOptions, kept dependency-free. */
export type UpdateNotice = {
  readonly type: 'info' | 'warning'
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly defaultId: number
  readonly cancelId: number
}

export function updateNotice(status: UpdateStatus): UpdateNotice {
  if (status.kind === 'update-available') {
    return {
      type: 'info',
      title: 'Update available',
      message: `Chop ${status.tag} is available.`,
      detail: `You are running ${status.current}. Chop is downloading the update in the background. “Relaunch to update” appears when it is ready.`,
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
    }
  }

  if (status.kind === 'up-to-date') {
    return {
      type: 'info',
      title: 'No updates',
      message: 'Chop is up to date.',
      detail: `You are running ${status.current}.`,
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
    }
  }

  return {
    type: 'warning',
    title: 'Update check failed',
    message: 'Could not check for updates.',
    detail: status.reason,
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0,
  }
}
