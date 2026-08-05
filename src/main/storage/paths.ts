import { app } from 'electron'
import { join } from 'node:path'

const SIDECAR = '.chop'

export function defaultCaptureRoot(): string {
  return join(app.getPath('pictures'), 'Chop')
}

export function sidecarDirs(rootDir: string): {
  readonly base: string
  readonly originals: string
  readonly docs: string
  readonly thumbs: string
} {
  const base = join(rootDir, SIDECAR)
  return {
    base,
    originals: join(base, 'originals'),
    docs: join(base, 'docs'),
    thumbs: join(base, 'thumbs'),
  }
}

export function manifestPath(rootDir: string): string {
  return join(sidecarDirs(rootDir).base, 'manifest.json')
}

export function capturePaths(
  rootDir: string,
  name: string,
): {
  readonly flat: string
  readonly original: string
  readonly doc: string
  readonly thumb: string
} {
  const dirs = sidecarDirs(rootDir)
  return {
    flat: join(rootDir, `${name}.png`),
    original: join(dirs.originals, `${name}.png`),
    doc: join(dirs.docs, `${name}.json`),
    thumb: join(dirs.thumbs, `${name}.png`),
  }
}
