import { calloutTextWidth, readableTextColor, withCalloutText } from '@shared/callout'
import { AUTOSAVE_DEBOUNCE_MS, CALLOUT_LINE_HEIGHT_RATIO } from '@shared/constants'
import { debounce } from '@shared/debounce'
import type {
  CalloutAnnotation,
  CaptureDocument,
  TextAnnotation,
} from '@shared/document'
import {
  addAnnotation,
  createDocument,
  parseDocument,
  removeAnnotation,
  updateAnnotation,
} from '@shared/document'
import type { Point } from '@shared/geometry'
import {
  cancelPreview,
  commitCrop,
  commitDocument,
  commitPreview,
  createEditorState,
  currentDocument,
  type EditorState,
  previewDocument,
  redoState,
  setEditingCallout,
  setSelectedAnnotation,
  setStyle,
  setTool,
  undoState,
} from '@shared/editor-state'
import type { CaptureResult, ShortcutInfo } from '@shared/ipc'
import type { ToolId } from '@shared/tools'
import type { BackgroundUpdateState } from '@shared/update'
import { createCalloutInput, type CalloutInputGeometry } from './callout-input'
import { browserCanvasFactory, createCanvasView, textMeasurer } from './canvas-view'
import { createFilmstrip } from './filmstrip'
import type { FilmstripEntry } from './filmstrip'
import { attachInteractions } from './interactions'
import { createTextInput } from './text-input'
import { createToolbar } from './toolbar'

type EditorBridge = {
  onCapture(handler: (capture: CaptureResult) => void): void
  save(payload: { id: string; flattenedDataUrl: string; document: unknown }): Promise<void>
  copy(dataUrl: string): void
  saveAs(dataUrl: string): Promise<string | null>
  listCaptures(): Promise<unknown>
  openCapture(id: string): Promise<unknown>
  deleteCapture(id: string): Promise<boolean>
  getShortcut(): Promise<ShortcutInfo>
  onShortcutChanged(handler: (shortcut: ShortcutInfo) => void): void
  getUpdateState(): Promise<BackgroundUpdateState>
  relaunchToUpdate(): Promise<boolean>
  onUpdateStateChanged(listener: (state: BackgroundUpdateState) => void): void
}

const bridge = (window as unknown as { chopEditor: EditorBridge }).chopEditor

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const stage = document.querySelector<HTMLDivElement>('#stage')!
const toolbarRoot = document.querySelector<HTMLDivElement>('#toolbar')!
const textElement = document.querySelector<HTMLTextAreaElement>('#text-input')!
const calloutElement = document.querySelector<HTMLTextAreaElement>('#callout-input')!
const empty = document.querySelector<HTMLDivElement>('#empty')!
const filmstripRoot = document.querySelector<HTMLDivElement>('#filmstrip')!
const updateCard = document.querySelector<HTMLButtonElement>('#editor-update-ready')!
const updateVersion = document.querySelector<HTMLElement>('#editor-update-version')!
const zoomControls = document.querySelector<HTMLDivElement>('#zoom-controls')!
const zoomOutButton = document.querySelector<HTMLButtonElement>('#zoom-out')!
const zoomLevelButton = document.querySelector<HTMLButtonElement>('#zoom-level')!
const zoomInButton = document.querySelector<HTMLButtonElement>('#zoom-in')!

function showUpdateState(update: BackgroundUpdateState): void {
  const ready = update.phase === 'ready'
  updateCard.hidden = !ready
  updateCard.disabled = false
  if (ready) updateVersion.textContent = update.tag.replace(/^v/, '')
}

updateCard.addEventListener('click', () => {
  updateCard.disabled = true
  void bridge
    .relaunchToUpdate()
    .then((started) => {
      if (!started) updateCard.disabled = false
    })
    .catch((error: unknown) => {
      console.error('Could not relaunch to update.', error)
      updateCard.disabled = false
    })
})
bridge.onUpdateStateChanged(showUpdateState)
void bridge.getUpdateState().then(showUpdateState).catch(console.error)

const view = createCanvasView(canvas)
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
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
  toolbar.setColor(state.style.color)
  toolbar.setStrokeWidth(state.style.strokeWidth)
  if (loaded) view.render(state)
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function updateZoomControls(): void {
  const zoom = view.zoom()
  zoomLevelButton.textContent = `${Math.round(zoom * 100)}%`
  zoomOutButton.disabled = zoom <= MIN_ZOOM
  zoomInButton.disabled = zoom >= MAX_ZOOM
}

/**
 * Zooms around a viewport point so the content under the pointer does not jump.
 * Button zoom uses the middle of the stage as its anchor.
 */
function applyZoom(nextZoom: number, clientX?: number, clientY?: number): void {
  if (!loaded) return
  const zoom = clampZoom(Math.round(nextZoom * 100) / 100)
  if (zoom === view.zoom()) return

  // HTML editors are canvas-positioned at their opening scale. Commit them before
  // the canvas changes size so no field is left detached from its annotation.
  calloutInput.commit()
  if (textInput.isOpen) textInput.commit()

  const stageRect = stage.getBoundingClientRect()
  const anchorX = clientX ?? stageRect.left + stageRect.width / 2
  const anchorY = clientY ?? stageRect.top + stageRect.height / 2
  const before = canvas.getBoundingClientRect()
  const relativeX = before.width > 0 ? (anchorX - before.left) / before.width : 0.5
  const relativeY = before.height > 0 ? (anchorY - before.top) / before.height : 0.5

  view.setZoom(zoom)
  draw()
  updateZoomControls()

  const after = canvas.getBoundingClientRect()
  stage.scrollLeft += after.left + after.width * relativeX - anchorX
  stage.scrollTop += after.top + after.height * relativeY - anchorY
}

function stepZoom(direction: -1 | 1, clientX?: number, clientY?: number): void {
  applyZoom(view.zoom() + direction * ZOOM_STEP, clientX, clientY)
}

/** Where Escape and Enter return to when a crop session ends. */
let lastNonCropTool: ToolId = 'box'

function applyTool(tool: ToolId, from: EditorState = state): void {
  if (tool !== 'crop') lastNonCropTool = tool
  store.set(setTool(from, tool))
}

/** Removes the selected annotation and drops the selection. */
function deleteSelectedAnnotation(): void {
  const id = state.selectedAnnotationId
  if (!id) return
  cancelCalloutEdit()
  store.set(
    setSelectedAnnotation(
      commitDocument(state, removeAnnotation(currentDocument(state), id)),
      null,
    ),
  )
}

/** Recolors the selected annotation, if it has a color, as one undoable step. */
function applyColor(color: string): void {
  const styled = setStyle(state, { color })
  const id = state.selectedAnnotationId
  const target = id
    ? currentDocument(state).annotations.find((a) => a.id === id)
    : null
  if (!target || target.kind === 'blur' || target.color === color) {
    store.set(styled)
    return
  }
  store.set(
    commitDocument(
      styled,
      updateAnnotation(currentDocument(styled), target.id, (a) =>
        a.kind === 'blur' ? a : { ...a, color },
      ),
    ),
  )
}

const toolbar = createToolbar(toolbarRoot, {
  onTool: applyTool,
  onColor: applyColor,
  onStrokeWidth: (strokeWidth) => store.set(setStyle(state, { strokeWidth })),
  onUndo: () => store.set(undoState(state)),
  onRedo: () => store.set(redoState(state)),
  onCopy: () => copyToClipboard(),
})

const textInput = createTextInput(textElement)

/** Converts a point in image coordinates to a position inside the stage. */
function stagePoint(imagePoint: Point): Point {
  const stageRect = stage.getBoundingClientRect()
  const canvasRect = canvas.getBoundingClientRect()
  const local = view.toCanvasPoint(imagePoint, state)
  return {
    x: canvasRect.left - stageRect.left + local.x,
    y: canvasRect.top - stageRect.top + local.y,
  }
}

const calloutInput = createCalloutInput(calloutElement)

zoomOutButton.addEventListener('click', () => stepZoom(-1))
zoomInButton.addEventListener('click', () => stepZoom(1))
zoomLevelButton.addEventListener('click', () => applyZoom(1))

stage.addEventListener(
  'wheel',
  (event) => {
    if (!event.metaKey || event.deltaY === 0 || !loaded) return
    event.preventDefault()
    stepZoom(event.deltaY < 0 ? 1 : -1, event.clientX, event.clientY)
  },
  { passive: false },
)

/** The document from before the open note was touched, so undo steps over the whole edit. */
let calloutEditOrigin: CaptureDocument | null = null

/** Document state before the text input opened, so undo steps over the whole edit. */
let textEditOrigin: CaptureDocument | null = null
/** Temporary annotation ID used during live text preview. */
let tempTextId: string | null = null

/** Where the overlay must sit to line up with the bubble as the canvas draws it. */
function calloutGeometry(callout: CalloutAnnotation): CalloutInputGeometry {
  const scale = view.scale()
  return {
    at: stagePoint({ x: callout.rect.x, y: callout.rect.y }),
    width: callout.rect.width * scale,
    height: callout.rect.height * scale,
    textWidth: calloutTextWidth(callout.rect.width) * scale,
    fontSize: callout.fontSize * scale,
    lineHeight: callout.fontSize * CALLOUT_LINE_HEIGHT_RATIO * scale,
    color: readableTextColor(callout.color),
  }
}

function calloutById(doc: CaptureDocument, id: string): CalloutAnnotation | null {
  const found = doc.annotations.find((annotation) => annotation.id === id)
  return found?.kind === 'callout' ? found : null
}

/** The document as it would be with `text` on the callout being edited. */
function documentWithNote(origin: CaptureDocument, id: string, text: string): CaptureDocument {
  if (!calloutById(origin, id)) return origin
  // The measurer is passed per font size: the note is re-sized to its bubble.
  return withCalloutText(origin, id, text, textMeasurer)
}

function startCalloutEdit(callout: CalloutAnnotation): void {
  const origin = currentDocument(state)
  calloutEditOrigin = origin
  store.set(setEditingCallout(state, callout.id))
  calloutInput.open({
    geometry: calloutGeometry(callout),
    initialText: callout.text,
    // Every keystroke is measured against the untouched document, so the bubble
    // grows and shrinks with the note instead of only ever growing.
    onInput: (text) => {
      const previewed = documentWithNote(origin, callout.id, text)
      store.set(previewDocument(state, previewed))
      const updated = calloutById(previewed, callout.id)
      if (updated) calloutInput.reposition(calloutGeometry(updated))
    },
    onCommit: (text) => finishCalloutEdit(text),
    onCancel: () => cancelCalloutEdit(),
  })
}

/** Writes the note as a single undoable change. An unchanged note writes nothing. */
function finishCalloutEdit(text: string): void {
  const origin = calloutEditOrigin
  const id = state.editingCalloutId
  calloutEditOrigin = null
  if (!origin || !id) return

  const before = calloutById(origin, id)
  if (!before || before.text === text) {
    store.set(setEditingCallout(previewDocument(state, origin), null))
    return
  }
  const edited = documentWithNote(origin, id, text)
  store.set(setEditingCallout(commitPreview(previewDocument(state, edited), origin), null))
}

/** Closes both overlays without touching the document, for when the document is replaced. */
function discardEditors(): void {
  calloutInput.close()
  calloutEditOrigin = null
  textInput.close()
  textEditOrigin = null
  tempTextId = null
}

/** Discards the live text preview, leaving the document as it was. */
function discardTextEditor(): void {
  const origin = textEditOrigin
  textEditOrigin = null
  tempTextId = null
  textInput.close()
  if (origin) store.set(cancelPreview(state, origin))
}

/** Drops the note being typed, leaving the callout as it was. */
function cancelCalloutEdit(): void {
  const origin = calloutEditOrigin
  calloutEditOrigin = null
  calloutInput.close()
  if (origin) store.set(setEditingCallout(cancelPreview(state, origin), null))
}

attachInteractions(canvas, view, store, {
  onCanvasPress: () => {
    calloutInput.commit()
    if (textInput.isOpen) textInput.commit()
  },

  onTextPoint: (event, imagePoint) => {
    const stageRect = stage.getBoundingClientRect()
    const origin = currentDocument(state)
    const id = crypto.randomUUID()
    textEditOrigin = origin
    tempTextId = id

    textInput.open({
      at: { x: event.clientX - stageRect.left, y: event.clientY - stageRect.top },
      style: state.style,
      scale: view.scale(),
      onInput: (text) => {
        const doc = currentDocument(state)
        const existing = doc.annotations.find((a) => a.id === id)
        const annotation: TextAnnotation = {
          id,
          kind: 'text',
          at: imagePoint,
          text,
          color: state.style.color,
          fontSize: state.style.fontSize,
        }
        const updated = existing
          ? updateAnnotation(doc, id, () => annotation)
          : addAnnotation(doc, annotation)
        store.set(previewDocument(state, updated))
      },
      onCommit: (text) => {
        const finalAnnotation: TextAnnotation = {
          id,
          kind: 'text',
          at: imagePoint,
          text,
          color: state.style.color,
          fontSize: state.style.fontSize,
        }
        const doc = currentDocument(state)
        const existing = doc.annotations.find((a) => a.id === id)
        const updated = existing
          ? updateAnnotation(doc, id, () => finalAnnotation)
          : addAnnotation(doc, finalAnnotation)
        store.set(
          commitPreview(previewDocument(state, updated), textEditOrigin!),
        )
        textEditOrigin = null
        tempTextId = null
      },
      onCancel: () => discardTextEditor(),
    })
  },

  onCalloutEdit: (callout) => startCalloutEdit(callout),

  onCalloutDelete: (callout) => {
    // A note being typed is abandoned: the bubble it belongs to is going away.
    cancelCalloutEdit()
    store.set(commitDocument(state, removeAnnotation(currentDocument(state), callout.id)))
  },
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
  commitPendingCrop()
  const dataUrl = flattenToDataUrl()
  if (dataUrl) bridge.copy(dataUrl)
}

async function save(): Promise<void> {
  const dataUrl = flattenToDataUrl()
  if (!dataUrl) return
  await bridge.save({
    id: currentDocument(state).id,
    flattenedDataUrl: dataUrl,
    document: currentDocument(state),
  })
}

const autosave = debounce(save, AUTOSAVE_DEBOUNCE_MS)
window.addEventListener('beforeunload', () => autosave.flush())

/** Writes now, dropping any debounced save so the same state is not written twice. */
function saveNow(): void {
  autosave.cancel()
  void save()
}

/** Folds any working crop frame into the document so exports include it. */
function commitPendingCrop(): void {
  if (isCropping()) applyTool(lastNonCropTool, commitCrop(state))
}

/** Applies the working crop frame, leaves crop, and writes the result to disk. */
function finishCrop(): void {
  commitPendingCrop()
  saveNow()
}

/** Abandons the working crop frame; the document keeps whatever crop it had. */
function cancelCrop(): void {
  applyTool(lastNonCropTool)
}

/** True for the Crop tool's frame only: a trim applies itself on mouse release. */
function isCropping(): boolean {
  return state.cropSession?.mode === 'reframe'
}

const filmstrip = createFilmstrip(
  filmstripRoot,
  () => bridge.listCaptures() as Promise<readonly FilmstripEntry[]>,
  (id) => void openCapture(id),
  (id) => void deleteCapture(id),
)

/** Shows a loaded image, replacing the placeholder. */
function showCanvas(): void {
  loaded = true
  canvas.style.display = ''
  empty.style.display = 'none'
  zoomControls.hidden = false
  updateZoomControls()
}

/** Returns the editor to its blank state once the open capture is gone. */
function clearEditor(): void {
  // Drop any pending autosave, or the deleted capture would be written back.
  autosave.cancel()
  discardEditors()
  loaded = false
  imageElement = null
  view.setZoom(1)
  canvas.style.display = 'none'
  empty.style.display = ''
  zoomControls.hidden = true
  state = createEditorState(createDocument('empty', 0, 0))
  filmstrip.setActive(null)
  draw()
}

/** Opens the most recent capture so the editor has context on first load. */
async function openLastCapture(): Promise<void> {
  const captures = (await bridge.listCaptures()) as readonly FilmstripEntry[]
  const first = captures[0]
  if (first) void openCapture(first.id)
}

/** Deletes a capture outright — the filmstrip is the only undo. */
async function deleteCapture(id: string): Promise<void> {
  try {
    if (id === currentDocument(state).id) clearEditor()
    await bridge.deleteCapture(id)
  } catch (error) {
    console.error('Could not delete the capture.', error)
  }
  await filmstrip.refresh()
}

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
    view.setZoom(1)
    showCanvas()
    discardEditors()
    const doc = capture.documentJson
      ? parseDocument(capture.documentJson)
      : createDocument(capture.id, capture.width, capture.height, capture.scaleFactor)
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
    view.setZoom(1)
    showCanvas()
    discardEditors()
    store.set(createEditorState(createDocument(capture.id, capture.width, capture.height, capture.scaleFactor)))
    filmstrip.setActive(capture.id)
    // Wait for disk — refreshing earlier races the save and drops this capture from history.
    void save().then(() => filmstrip.refresh())
  })
  image.src = capture.dataUrl
})

/** Keeps the placeholder honest about whichever shortcut is in force. */
function showCaptureHint(shortcut: ShortcutInfo): void {
  empty.textContent = `Press ${shortcut.display} to capture`
}

bridge.onShortcutChanged(showCaptureHint)
void bridge
  .getShortcut()
  .then(showCaptureHint)
  .catch((error: unknown) => console.error('Could not read the capture shortcut.', error))

void filmstrip.refresh().then(() => {
  if (!loaded) void openLastCapture()
})
// Paints the starting tool and colour before the first capture arrives.
draw()

const SHORTCUT_TOOLS: Readonly<Record<string, ToolId>> = {
  b: 'box', a: 'arrow', t: 'text', h: 'highlight', x: 'blur', n: 'callout', c: 'crop',
}

document.addEventListener('keydown', (event) => {
  const meta = event.metaKey || event.ctrlKey

  if (isCropping() && (event.key === 'Enter' || event.key === 'Escape')) {
    event.preventDefault()
    if (event.key === 'Enter') finishCrop()
    else cancelCrop()
    return
  }

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
    commitPendingCrop()
    const dataUrl = flattenToDataUrl()
    if (dataUrl) void bridge.saveAs(dataUrl)
    return
  }
  if (!meta && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault()
    deleteSelectedAnnotation()
    return
  }
  if (!meta) {
    const tool = SHORTCUT_TOOLS[event.key.toLowerCase()]
    if (tool) applyTool(tool)
  }
})

window.addEventListener('resize', draw)
