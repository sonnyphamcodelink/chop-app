import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRecorder, type Recorder } from '../../src/renderer/settings/recorder'

type Listener = (event: unknown) => void

/** Minimal stand-in for an event target, so no DOM is needed. */
function createTarget(): {
  addEventListener(type: string, listener: Listener): void
  dispatch(type: string, event?: unknown): void
} {
  const listeners = new Map<string, Listener[]>()
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

const keydown = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: 'Digit2',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  preventDefault: () => {},
  stopPropagation: () => {},
  ...overrides,
})

let trigger: ReturnType<typeof createTarget>
let root: ReturnType<typeof createTarget>
let recorder: Recorder

const recorded: string[] = []
const previews: string[] = []
const problems: (string | null)[] = []
const recordingChanges: boolean[] = []

beforeEach(() => {
  recorded.length = 0
  previews.length = 0
  problems.length = 0
  recordingChanges.length = 0

  trigger = createTarget()
  root = createTarget()
  ;(globalThis as { window?: unknown }).window = root

  recorder = createRecorder(trigger as unknown as HTMLElement, 'darwin', {
    onRecord: (accelerator) => void recorded.push(accelerator),
    onPreview: (display) => void previews.push(display),
    onProblem: (message) => void problems.push(message),
    onRecordingChange: (recording) => void recordingChanges.push(recording),
  })
})

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('createRecorder', () => {
  it('ignores key presses until the field is clicked', () => {
    root.dispatch('keydown', keydown({ metaKey: true, shiftKey: true }))
    expect(recorded).toEqual([])
    expect(recorder.isRecording()).toBe(false)
  })

  it('records a chord and stops listening', () => {
    trigger.dispatch('click')
    root.dispatch('keydown', keydown({ metaKey: true, shiftKey: true, code: 'KeyK' }))

    expect(recorded).toEqual(['Shift+Command+K'])
    expect(recorder.isRecording()).toBe(false)
    expect(recordingChanges).toEqual([true, false])
  })

  it('previews the modifiers held so far', () => {
    trigger.dispatch('click')
    root.dispatch('keydown', keydown({ metaKey: true, shiftKey: true, code: 'MetaLeft' }))

    expect(previews.at(-1)).toBe('⇧⌘')
    expect(recorder.isRecording()).toBe(true)
  })

  it('keeps listening after a chord with no real modifier', () => {
    trigger.dispatch('click')
    root.dispatch('keydown', keydown({ shiftKey: true, code: 'KeyK' }))

    expect(recorded).toEqual([])
    expect(problems.at(-1)).toContain('Command')
    expect(recorder.isRecording()).toBe(true)
  })

  it('keeps listening after a key that cannot be in a shortcut', () => {
    trigger.dispatch('click')
    root.dispatch('keydown', keydown({ metaKey: true, code: 'Lang1' }))

    expect(recorded).toEqual([])
    expect(problems.at(-1)).toContain('key')
    expect(recorder.isRecording()).toBe(true)
  })

  it('cancels on Escape without recording anything', () => {
    trigger.dispatch('click')
    root.dispatch('keydown', keydown({ code: 'Escape' }))

    expect(recorded).toEqual([])
    expect(recordingChanges).toEqual([true, false])
  })

  it('cancels when the field loses focus', () => {
    trigger.dispatch('click')
    trigger.dispatch('blur')

    expect(recorder.isRecording()).toBe(false)
    expect(recordingChanges).toEqual([true, false])
  })

  it('stops when the field is clicked a second time', () => {
    trigger.dispatch('click')
    trigger.dispatch('click')
    expect(recorder.isRecording()).toBe(false)
  })

  it('reports the end of recording only once', () => {
    trigger.dispatch('click')
    recorder.stop()
    recorder.stop()
    expect(recordingChanges).toEqual([true, false])
  })

  it('swallows the keys it records, so nothing else acts on them', () => {
    const prevented: string[] = []
    trigger.dispatch('click')
    root.dispatch(
      'keydown',
      keydown({
        metaKey: true,
        code: 'KeyK',
        preventDefault: () => void prevented.push('default'),
        stopPropagation: () => void prevented.push('propagation'),
      }),
    )

    expect(prevented).toEqual(['default', 'propagation'])
  })
})
