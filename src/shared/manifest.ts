/** One saved capture. Paths are derived from `name`, never stored absolutely. */
export type CaptureRecord = {
  readonly id: string
  /** Timestamp base name shared by the image, original, doc, and thumbnail. */
  readonly name: string
  readonly createdAt: string
  readonly width: number
  readonly height: number
}

export type Manifest = {
  readonly version: 1
  readonly records: readonly CaptureRecord[]
}

export function emptyManifest(): Manifest {
  return { version: 1, records: [] }
}

/** Adds or replaces a record, keeping the list newest-first. */
export function addRecord(manifest: Manifest, record: CaptureRecord): Manifest {
  return {
    version: 1,
    records: [record, ...manifest.records.filter((r) => r.id !== record.id)],
  }
}

export function removeRecord(manifest: Manifest, id: string): Manifest {
  return { version: 1, records: manifest.records.filter((r) => r.id !== id) }
}

export function findRecord(manifest: Manifest, id: string): CaptureRecord | null {
  return manifest.records.find((r) => r.id === id) ?? null
}

function isRecord(value: unknown): value is CaptureRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number'
  )
}

/**
 * Never throws. A damaged manifest is not worth losing the app over — the caller
 * rebuilds it by scanning the capture directory.
 */
export function parseManifest(json: string): Manifest {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return emptyManifest()
    return { version: 1, records: parsed.records.filter(isRecord) }
  } catch {
    return emptyManifest()
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local-time base name, e.g. `2026-08-04 15-42-07`. */
export function captureBaseName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  return `${day} ${time}`
}
