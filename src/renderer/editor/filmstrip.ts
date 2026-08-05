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
): Filmstrip {
  let activeId: string | null = null

  function paint(entries: readonly FilmstripEntry[]): void {
    root.replaceChildren()
    for (const entry of entries) {
      if (!entry.thumbDataUrl) continue
      const img = document.createElement('img')
      img.src = entry.thumbDataUrl
      img.alt = entry.name
      img.title = entry.name
      img.dataset.id = entry.id
      img.classList.toggle('active', entry.id === activeId)
      img.addEventListener('click', () => onOpen(entry.id))
      root.append(img)
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
