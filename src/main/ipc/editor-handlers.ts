import { clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { thumbnailSize } from '@shared/flatten'
import { CHANNELS, type SaveRequest } from '@shared/ipc'
import { captureBaseName, findRecord } from '@shared/manifest'
import {
  deleteCapture,
  loadCapture,
  readManifest,
  rebuildManifest,
  saveCapture,
} from '../storage/capture-store'
import { capturePaths } from '../storage/paths'

/** Base names are assigned once per capture id so re-saves overwrite in place. */
const namesById = new Map<string, string>()

function nameFor(id: string): string {
  const existing = namesById.get(id)
  if (existing) return existing
  const name = captureBaseName(new Date())
  namesById.set(id, name)
  return name
}

export function registerEditorHandlers(rootDir: string): void {
  // invoke (not send) so the editor can refresh the filmstrip only after disk is ready.
  ipcMain.handle(CHANNELS.saveCapture, async (_event, request: SaveRequest) => {
    try {
      const image = nativeImage.createFromDataURL(request.flattenedDataUrl)
      if (image.isEmpty()) throw new Error('flattened image was empty')

      const size = image.getSize()
      const thumb = thumbnailSize(size.width, size.height)
      const name = nameFor(request.id)

      await saveCapture(rootDir, {
        id: request.id,
        name,
        createdAt: new Date().toISOString(),
        width: size.width,
        height: size.height,
        flatPng: image.toPNG(),
        originalPng: image.toPNG(),
        thumbPng: image.resize(thumb).toPNG(),
        documentJson: JSON.stringify(request.document),
      })
    } catch (error) {
      console.error('Failed to save capture.', error)
      await dialog.showMessageBox({
        type: 'error',
        title: 'Could not save capture',
        message:
          'Chop could not write the capture to disk. Use Save As to choose another location.',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  })

  ipcMain.on(CHANNELS.copyCapture, (_event, dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) {
      console.warn('Refusing to copy an empty image to the clipboard.')
      return
    }
    clipboard.writeImage(image)
  })

  ipcMain.handle(CHANNELS.saveCaptureAs, async (_event, dataUrl: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${captureBaseName(new Date())}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, nativeImage.createFromDataURL(dataUrl).toPNG())
    return filePath
  })

  ipcMain.handle(CHANNELS.listCaptures, async () => {
    const manifest = await readManifest(rootDir)
    const usable = manifest.records.length > 0 ? manifest : await rebuildManifest(rootDir)

    return Promise.all(
      usable.records.map(async (record) => {
        try {
          const bytes = await readFile(capturePaths(rootDir, record.name).thumb)
          return { ...record, thumbDataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
        } catch {
          // A missing thumbnail should not hide the capture from the filmstrip.
          return { ...record, thumbDataUrl: null }
        }
      }),
    )
  })

  ipcMain.handle(CHANNELS.openCapture, async (_event, id: string) => {
    const manifest = await readManifest(rootDir)
    const record = findRecord(manifest, id)
    if (!record) return null

    const { originalPng, documentJson } = await loadCapture(rootDir, record)
    namesById.set(record.id, record.name)
    return {
      id: record.id,
      dataUrl: `data:image/png;base64,${originalPng.toString('base64')}`,
      width: record.width,
      height: record.height,
      scaleFactor: 1,
      createdAt: record.createdAt,
      documentJson,
    }
  })

  ipcMain.handle(CHANNELS.deleteCapture, async (_event, id: string) => {
    try {
      const deleted = await deleteCapture(rootDir, id)
      // Free the reserved base name so a later capture never resaves over it.
      if (deleted) namesById.delete(id)
      return deleted
    } catch (error) {
      console.error('Failed to delete capture.', error)
      return false
    }
  })
}
