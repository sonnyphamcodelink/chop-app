import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { CHANNELS } from '@shared/ipc'
import { parsePastedImage, type PastedImage } from '@shared/feedback/attachment'
import { parseDraft } from '@shared/feedback/draft'
import { feedbackMailtoUrl } from '@shared/feedback/transcript'
import type {
  FeedbackContext,
  FeedbackDiagnostics,
  FeedbackDraft,
  FeedbackResult,
} from '@shared/feedback/types'
import { collectDiagnostics } from '../feedback/diagnostics'
import { FEEDBACK_EMAIL } from '../feedback/endpoint'
import { SEND_BUTTON, sendFeedbackNotice } from '../feedback/notice'
import { postFeedback } from '../feedback/send-feedback'

const REJECTED = 'That note was not in a shape Chop could send.'
const BAD_IMAGE = 'Chop could not read one of those images. Remove it and try again.'

/** Diagnostics only travel when the user left the box ticked. */
function diagnosticsFor(draft: FeedbackDraft): FeedbackDiagnostics | null {
  return draft.includeDiagnostics ? collectDiagnostics() : null
}

export function registerFeedbackHandlers(): void {
  ipcMain.handle(CHANNELS.getFeedbackContext, (): FeedbackContext => ({
    diagnostics: collectDiagnostics(),
  }))

  ipcMain.handle(CHANNELS.sendFeedback, async (event, value: unknown): Promise<FeedbackResult> => {
    const draft = parseDraft(value)
    if (!draft) return { status: 'failed', reason: REJECTED }

    // The images arrive as bytes from the clipboard, so they are checked here
    // rather than trusted: type, shape and size all have to hold for every one.
    const images = draft.attachments.map(parsePastedImage)
    if (images.some((image) => image === null)) {
      return { status: 'failed', reason: BAD_IMAGE }
    }

    const diagnostics = diagnosticsFor(draft)

    // Confirmed here rather than in the renderer, so the prompt cannot be
    // skipped and the dialog is a sheet on the window that asked for it.
    const notice = sendFeedbackNotice(draft, diagnostics)
    const options = { ...notice, buttons: [...notice.buttons] }
    const parent = BrowserWindow.fromWebContents(event.sender)

    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)

    if (response !== SEND_BUTTON) return { status: 'cancelled' }

    return postFeedback({ draft, diagnostics, images: images as PastedImage[] })
  })

  // The address is a constant in the bundle, never anything the renderer sent.
  ipcMain.handle(CHANNELS.emailFeedback, async (_event, value: unknown): Promise<boolean> => {
    const draft = parseDraft(value)
    if (!draft) return false

    await shell.openExternal(feedbackMailtoUrl(FEEDBACK_EMAIL, draft, diagnosticsFor(draft)))
    return true
  })
}
