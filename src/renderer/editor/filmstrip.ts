import type { CaptureRecord } from '@shared/manifest'

export type FilmstripEntry = CaptureRecord & { readonly thumbDataUrl: string | null }

export type Filmstrip = {
  refresh(): Promise<void>
  setActive(id: string | null): void
}

export function createFilmstrip(
  root: HTMLElement,
  list: () => Promise<readonly FilmstripEntry[]>,
  onOpen: (id: string) => void,
  onDelete: (id: string) => void,
): Filmstrip {
  let activeId: string | null = null

  function buildTile(entry: FilmstripEntry, thumbDataUrl: string): HTMLElement {
    const tile = document.createElement('div')
    tile.className = 'thumb'
    tile.dataset.id = entry.id
    tile.classList.toggle('active', entry.id === activeId)

    const img = document.createElement('img')
    img.src = thumbDataUrl
    img.alt = entry.name
    img.title = entry.name
    img.addEventListener('click', () => onOpen(entry.id))

    const remove = document.createElement('button')
    remove.className = 'remove'
    remove.type = 'button'
    remove.textContent = '×'
    remove.title = `Delete ${entry.name}`
    remove.setAttribute('aria-label', `Delete ${entry.name}`)
    // Without this the click falls through to the thumbnail and reopens it.
    remove.addEventListener('click', (event) => {
      event.stopPropagation()
      onDelete(entry.id)
    })

    tile.append(img, remove)
    return tile
  }

  function paint(entries: readonly FilmstripEntry[]): void {
    root.replaceChildren()
    for (const entry of entries) {
      if (!entry.thumbDataUrl) continue
      root.append(buildTile(entry, entry.thumbDataUrl))
    }
  }

  return {
    async refresh(): Promise<void> {
      try {
        paint(await list())
      } catch (error) {
        console.error('Could not load the capture history.', error)
      }
    },
    setActive(id: string | null): void {
      activeId = id
      for (const child of root.children) {
        if (child instanceof HTMLElement) {
          child.classList.toggle('active', child.dataset.id === id)
        }
      }
    },
  }
}
