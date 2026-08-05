export type Op = { readonly name: string; readonly args: readonly unknown[] }

export type MockContext = {
  readonly ops: readonly Op[]
  readonly ctx: CanvasRenderingContext2D
}

/**
 * A recording stand-in for CanvasRenderingContext2D. Canvas is unavailable in a
 * Node test environment, so rendering is verified by the sequence of calls.
 */
export function createMockContext(): MockContext {
  const ops: Op[] = []
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      ops.push({ name, args })
    }

  const ctx = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    drawImage: record('drawImage'),
    rect: record('rect'),
    clip: record('clip'),
    clearRect: record('clearRect'),
    set globalCompositeOperation(value: string) {
      ops.push({ name: 'set:globalCompositeOperation', args: [value] })
    },
    set globalAlpha(value: number) {
      ops.push({ name: 'set:globalAlpha', args: [value] })
    },
    set imageSmoothingEnabled(value: boolean) {
      ops.push({ name: 'set:imageSmoothingEnabled', args: [value] })
    },
    set filter(value: string) {
      ops.push({ name: 'set:filter', args: [value] })
    },
    set strokeStyle(value: string) {
      ops.push({ name: 'set:strokeStyle', args: [value] })
    },
    set fillStyle(value: string) {
      ops.push({ name: 'set:fillStyle', args: [value] })
    },
    set lineWidth(value: number) {
      ops.push({ name: 'set:lineWidth', args: [value] })
    },
    set font(value: string) {
      ops.push({ name: 'set:font', args: [value] })
    },
    set textBaseline(value: string) {
      ops.push({ name: 'set:textBaseline', args: [value] })
    },
    set lineJoin(value: string) {
      ops.push({ name: 'set:lineJoin', args: [value] })
    },
  } as unknown as CanvasRenderingContext2D

  return { ops, ctx }
}

export function opNames(ops: readonly Op[]): readonly string[] {
  return ops.map((op) => op.name)
}
