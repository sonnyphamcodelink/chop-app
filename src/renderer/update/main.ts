import type { UpdateWindowState } from '@shared/update'

type UpdateBridge = {
  cancel(): void
  onProgress(listener: (state: UpdateWindowState) => void): void
}

declare global {
  interface Window {
    chopUpdate?: UpdateBridge
  }
}

const bridge = window.chopUpdate
if (!bridge) throw new Error('Update bridge is unavailable')

const title = document.querySelector<HTMLHeadingElement>('#title')!
const message = document.querySelector<HTMLParagraphElement>('#message')!
const progress = document.querySelector<HTMLProgressElement>('#progress')!
const detail = document.querySelector<HTMLSpanElement>('#detail')!
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!

function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function render(state: UpdateWindowState): void {
  document.body.classList.toggle('failed', state.phase === 'failed')

  if (state.phase === 'downloading') {
    title.textContent = `Downloading Chop ${state.tag}…`
    message.textContent = 'Chop will reopen automatically when the update is installed.'
    progress.value = state.percent
    detail.textContent = `${state.percent}% — ${megabytes(state.received)} of ${megabytes(state.total)}`
    cancel.disabled = false
    cancel.textContent = 'Cancel'
    return
  }

  if (state.phase === 'preparing') {
    title.textContent = `Installing Chop ${state.tag}…`
    message.textContent = state.message
    progress.removeAttribute('value')
    detail.textContent = 'Do not quit Chop.'
    cancel.disabled = true
    return
  }

  title.textContent = 'Update failed'
  message.textContent = state.message
  detail.textContent = 'The installed version was not changed.'
  cancel.disabled = false
  cancel.textContent = 'Close'
}

cancel.addEventListener('click', () => bridge.cancel())
bridge.onProgress(render)
