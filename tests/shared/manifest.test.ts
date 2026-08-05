import { describe, expect, it } from 'vitest'
import {
  addRecord,
  captureBaseName,
  type CaptureRecord,
  emptyManifest,
  findRecord,
  parseManifest,
  removeRecord,
} from '@shared/manifest'

const record: CaptureRecord = {
  id: 'id-1',
  name: '2026-08-04 15-42-07',
  createdAt: '2026-08-04T15:42:07.000Z',
  width: 800,
  height: 600,
}

const older: CaptureRecord = { ...record, id: 'id-0', name: '2026-08-04 10-00-00' }

describe('emptyManifest', () => {
  it('is version 1 with no records', () => {
    expect(emptyManifest()).toEqual({ version: 1, records: [] })
  })
})

describe('addRecord', () => {
  it('puts the newest record first', () => {
    const manifest = addRecord(addRecord(emptyManifest(), older), record)
    expect(manifest.records.map((r) => r.id)).toEqual(['id-1', 'id-0'])
  })

  it('replaces a record with the same id instead of duplicating', () => {
    const updated = { ...record, width: 1000 }
    const manifest = addRecord(addRecord(emptyManifest(), record), updated)
    expect(manifest.records).toHaveLength(1)
    expect(manifest.records[0]?.width).toBe(1000)
  })

  it('does not mutate the input manifest', () => {
    const original = emptyManifest()
    addRecord(original, record)
    expect(original.records).toEqual([])
  })
})

describe('removeRecord', () => {
  it('drops the matching record', () => {
    const manifest = addRecord(addRecord(emptyManifest(), older), record)
    expect(removeRecord(manifest, 'id-1').records.map((r) => r.id)).toEqual(['id-0'])
  })
})

describe('findRecord', () => {
  it('returns the matching record', () => {
    expect(findRecord(addRecord(emptyManifest(), record), 'id-1')?.name).toBe(record.name)
  })

  it('returns null when absent', () => {
    expect(findRecord(emptyManifest(), 'nope')).toBeNull()
  })
})

describe('parseManifest', () => {
  it('round-trips a serialised manifest', () => {
    const manifest = addRecord(emptyManifest(), record)
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('returns an empty manifest for malformed JSON rather than throwing', () => {
    expect(parseManifest('{broken')).toEqual(emptyManifest())
  })

  it('returns an empty manifest for an unexpected version', () => {
    expect(parseManifest('{"version":99,"records":[]}')).toEqual(emptyManifest())
  })

  it('drops records missing required fields', () => {
    const payload = JSON.stringify({ version: 1, records: [record, { id: 'bad' }] })
    expect(parseManifest(payload).records.map((r) => r.id)).toEqual(['id-1'])
  })
})

describe('captureBaseName', () => {
  it('formats a filesystem-safe local timestamp', () => {
    const name = captureBaseName(new Date(2026, 7, 4, 15, 42, 7))
    expect(name).toBe('2026-08-04 15-42-07')
  })

  it('zero-pads single-digit components', () => {
    const name = captureBaseName(new Date(2026, 0, 2, 3, 4, 5))
    expect(name).toBe('2026-01-02 03-04-05')
  })

  it('contains no characters illegal in a filename', () => {
    expect(captureBaseName(new Date())).not.toMatch(/[/\\:*?"<>|]/)
  })
})
