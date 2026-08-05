import { AUTOSAVE_DEBOUNCE_MS } from '@shared/constants'
import { debounce } from '@shared/debounce'
import { addAnnotation, createDocument, parseDocument } from '@shared/document'
import {
  commitDocument,
  createEditorState,
  currentDocument,
  deleteSelected,
  type EditorState,
  redoState,
  selectAnnotation,
  setStyle,
  setTool,
  undoState,
} from '@shared/editor-state'
import type { CaptureResult } from '@shared/ipc'
import type { ToolId } from '@shared/tools'
import { browserCanvasFactory, createCanvasView } from './canvas-view'
import { createFilmstrip, type FilmstripEntry } from './filmstrip'
import { attachInteractions } from './interactions'
import { createTextInput } from './text-input'
import { createToolbar } from './toolbar'

type EditorBridge = {
  onCapture(handler: (capture: CaptureResult) => void): void
  save(payload: { id: string; flattenedDataUrl: string; document: unknown }): void
  copy(dataUrl: string): void
  saveAs(dataUrl: string): Promise<string | null>
  listCaptures(): Promise<unknown>
  openCapture(id: string): Promise<unknown>
}

const bridge = (window as unknown as { chopEditor: EditorBridge }).chopEditor

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const stage = document.querySelector<HTMLDivElement>('#stage')!
const toolbarRoot = document.querySelector<HTMLDivElement>('#toolbar')!
const textElement = document.querySelector<HTMLInputElement>('#text-input')!
const empty = document.querySelector<HTMLDivElement>('#empty')!
const filmstripRoot = document.querySelector<HTMLDivElement>('#filmstrip')!

const view = createCanvasView(canvas)
let state: EditorState = createEditorState(createDocument('empty', 0, 0))
let loaded = false
let imageElement: HTMLImageElement | null = null

const store = {
  get: (): EditorState => state,
  set: (next: EditorState): void => {
    const documentChanged = next.history.present !== state.history.present
    state = next
    draw()
    // `autosave` is initialised below; no store.set runs during module init.
    if (documentChanged && loaded) autosave()
  },
}

function draw(): void {
  toolbar.setActive(state.tool)
  if (loaded) view.render(state)
}

const toolbar = createToolbar(toolbarRoot, {
  onTool: (tool) => store.set(setTool(state, tool)),
  onColor: (color) => store.set(setStyle(state, { color })),
  onStrokeWidth: (strokeWidth) => store.set(setStyle(state, { strokeWidth })),
  onUndo: () => store.set(undoState(state)),
  onRedo: () => store.set(redoState(state)),
  onCopy: () => copyToClipboard(),
})

const textInput = createTextInput(textElement, (text, at) => {
  store.set(
    commitDocument(
      state,
      addAnnotation(currentDocument(state), {
        id: crypto.randomUUID(),
        kind: 'text',
        at,
        text,
        color: state.style.color,
        fontSize: state.style.fontSize,
      }),
    ),
  )
})

attachInteractions(canvas, view, store, (event, imagePoint) => {
  const stageRect = stage.getBoundingClientRect()
  textInput.open(
    { x: event.clientX - stageRect.left, y: event.clientY - stageRect.top },
    imagePoint,
    state.style,
    view.scale(),
  )
})

function flattenToDataUrl(): string {
  if (!imageElement) return ''
  const doc = currentDocument(state)
  const size = doc.cropRect
    ? { width: doc.cropRect.width, height: doc.cropRect.height }
    : { width: doc.width, height: doc.height }
  const target = browserCanvasFactory(size.width, size.height)
  // Reuse the exact editor render path so saved output matches the preview.
  view.renderTo(target.ctx, state)
  return (target.canvas as HTMLCanvasElement).toDataURL('image/png')
}

function copyToClipboard(): void {
  const dataUrl = flattenToDataUrl()
  if (dataUrl) bridge.copy(dataUrl)
}

function save(): void {
  const dataUrl = flattenToDataUrl()
  if (!dataUrl) return
  bridge.save({
    id: currentDocument(state).id,
    flattenedDataUrl: dataUrl,
    document: currentDocument(state),
  })
}

const autosave = debounce(save, AUTOSAVE_DEBOUNCE_MS)
window.addEventListener('beforeunload', () => autosave.flush())

const filmstrip = createFilmstrip(
  filmstripRoot,
  () => bridge.listCaptures() as Promise<readonly FilmstripEntry[]>,
  (id) => void openCapture(id),
)

/** Loads a past capture, restoring its annotations so they stay editable. */
async function openCapture(id: string): Promise<void> {
  const capture = (await bridge.openCapture(id)) as
    | (CaptureResult & { documentJson: string | null })
    | null
  if (!capture) return

  const image = new Image()
  image.addEventListener('load', () => {
    imageElement = image
    view.setImage(image)
    loaded = true
    empty.style.display = 'none'
    const doc = capture.documentJson
      ? parseDocument(capture.documentJson)
      : createDocument(capture.id, capture.width, capture.height)
    state = createEditorState(doc)
    filmstrip.setActive(capture.id)
    draw()
  })
  image.src = capture.dataUrl
}

bridge.onCapture((capture) => {
  const image = new Image()
  image.addEventListener('load', () => {
    imageElement = image
    view.setImage(image)
    loaded = true
    empty.style.display = 'none'
    store.set(createEditorState(createDocument(capture.id, capture.width, capture.height)))
    save()
    filmstrip.setActive(capture.id)
    void filmstrip.refresh()
  })
  image.src = capture.dataUrl
})

void filmstrip.refresh()

const SHORTCUT_TOOLS: Readonly<Record<string, ToolId>> = {
  v: 'select', b: 'box', a: 'arrow', t: 'text', h: 'highlight', x: 'blur', c: 'crop',
}

document.addEventListener('keydown', (event) => {
  const meta = event.metaKey || event.ctrlKey

  if (meta && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    store.set(event.shiftKey ? redoState(state) : undoState(state))
    return
  }
  if (meta && event.key.toLowerCase() === 'c') {
    event.preventDefault()
    copyToClipboard()
    return
  }
  if (meta && event.key.toLowerCase() === 's') {
    event.preventDefault()
    const dataUrl = flattenToDataUrl()
    if (dataUrl) void bridge.saveAs(dataUrl)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (state.selectedId) {
      event.preventDefault()
      store.set(deleteSelected(state))
    }
    return
  }
  if (event.key === 'Escape') {
    store.set(selectAnnotation(state, null))
    return
  }
  if (!meta) {
    const tool = SHORTCUT_TOOLS[event.key.toLowerCase()]
    if (tool) store.set(setTool(state, tool))
  }
})

window.addEventListener('resize', draw)
