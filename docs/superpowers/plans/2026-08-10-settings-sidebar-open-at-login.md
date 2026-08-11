# Settings Sidebar + Open at Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Open at Login from the tray into a sidebar Settings window (General + Shortcuts), keeping the existing macOS approval dialog.

**Architecture:** Extend the current settings HTML/TS shell with a left sidebar that switches panes. Add `getOpenAtLogin` / `setOpenAtLogin` IPC on the settings bridge; handlers call existing `login-item.ts`. Remove login-item handlers from the tray menu.

**Tech Stack:** Electron, TypeScript, Vitest, vanilla settings renderer (`src/renderer/settings/`).

## Global Constraints

- Open at Login lives in Settings only — gone from the tray menu.
- Settings layout is a **sidebar** with panes **General** and **Shortcuts**.
- Default pane on open is **General**.
- macOS `requires-approval` keeps the **existing dialog** (not an inline banner).
- Settings window: non-resizable, **600 × 380**.
- Switch is on only when state is `enabled`; `requires-approval` and `disabled` are off.
- Unsupported platforms: hide the switch; show a short unavailable note.
- Preserve Capture shortcut recorder behavior in the Shortcuts pane.
- Do not add other General prefs, pane memory, sidebar icons, or a new UI framework.
- Spec: `docs/superpowers/specs/2026-08-10-settings-sidebar-open-at-login-design.md`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/main/tray.ts` | Tray menu without Open at Login |
| `src/main/index.ts` | Stop passing login-item tray handlers |
| `src/shared/ipc.ts` | `LoginItemState` type + get/set channels |
| `src/main/login-item-state.ts` | Re-export `LoginItemState` from shared (keep mapping helpers here) |
| `src/main/ipc/settings-handlers.ts` | Shortcut + login-item IPC handlers |
| `src/preload/settings.ts` | Expose get/set open-at-login on `chopSettings` |
| `src/main/settings-window.ts` | Window size 600×380 |
| `src/renderer/settings/index.html` | Sidebar shell + General + Shortcuts markup/CSS |
| `src/renderer/settings/main.ts` | Pane switching + General switch + existing shortcut wiring |
| `tests/main/tray.test.ts` | Assert Open at Login is absent; keep other tray coverage |
| `tests/main/settings-handlers-login.test.ts` | IPC get/set open-at-login |
| `docs/manual-smoke-tests.md` | Settings General + tray no longer has Open at Login |

---

### Task 1: Remove Open at Login from the tray

**Files:**
- Modify: `tests/main/tray.test.ts`
- Modify: `src/main/tray.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: existing `createTray` / `TrayHandlers` without login fields after this task
- Produces: `TrayHandlers` with only `onCapture`, `onOpenEditor`, `onOpenSettings`, `onCheckForUpdates`, `captureShortcut`, `captureRoot`

- [ ] **Step 1: Rewrite tray tests so Open at Login is gone**

Replace the login-item-focused tests in `tests/main/tray.test.ts` with absence + menu-shape coverage. Remove `LoginItemState` import, `toggles`, `state`, and the login fields from `build()`.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Template = {
  label?: string
  type?: string
  checked?: boolean
  accelerator?: string
  click?: () => void
}[]

/** Menus handed to the tray, oldest first. */
const menus: Template[] = []

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getVersion: () => '1.2.3',
  },
  nativeImage: { createFromPath: () => ({ setTemplateImage: () => {} }) },
  Menu: { buildFromTemplate: (template: Template) => template },
  Tray: class {
    setToolTip(): void {}
    setContextMenu(menu: Template): void {
      menus.push(menu)
    }
  },
  shell: { openPath: async () => {} },
}))

const { createTray } = await import('../../src/main/tray')

let shortcut = 'CommandOrControl+Shift+2'
let settingsOpened = 0

function build(): { refresh(): void } {
  return createTray({
    onCapture: () => {},
    onOpenEditor: () => {},
    onOpenSettings: () => void (settingsOpened += 1),
    onCheckForUpdates: () => {},
    captureShortcut: () => shortcut,
    captureRoot: () => '/captures',
  })
}

beforeEach(() => {
  menus.length = 0
  shortcut = 'CommandOrControl+Shift+2'
  settingsOpened = 0
})

describe('createTray', () => {
  it('does not offer Open at Login', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).not.toContain('Open at Login')
  })

  it('keeps the action entries', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).toEqual([
      'Capture',
      'Open Editor',
      undefined, // separator
      'Open Captures Folder',
      'Settings…',
      undefined, // separator
      'Version 1.2.3',
      'Check for Updates…',
      undefined, // separator
      'Quit Chop',
    ])
  })

  it('shows the capture shortcut in force', () => {
    shortcut = 'Control+Alt+K'
    build()
    const capture = (menus[0] ?? []).find((entry) => entry.label === 'Capture')
    expect(capture?.accelerator).toBe('Control+Alt+K')
  })

  it('picks up a shortcut changed elsewhere when refreshed', () => {
    const controller = build()
    shortcut = 'Control+Alt+K'
    controller.refresh()

    const capture = (menus[1] ?? []).find((entry) => entry.label === 'Capture')
    expect(capture?.accelerator).toBe('Control+Alt+K')
  })

  it('opens settings from the menu', () => {
    build()
    ;(menus[0] ?? []).find((entry) => entry.label === 'Settings…')?.click?.()
    expect(settingsOpened).toBe(1)
  })
})
```

- [ ] **Step 2: Run tray tests — expect fail**

Run: `npm test -- tests/main/tray.test.ts`

Expected: FAIL — `build()` still requires `openAtLogin` / `onToggleOpenAtLogin`, and/or labels still include Open at Login.

- [ ] **Step 3: Strip login items from tray + main wiring**

`src/main/tray.ts` — remove `LoginItemState` import, `openAtLogin` / `onToggleOpenAtLogin` from `TrayHandlers`, delete `openAtLoginItems`, and simplify `buildMenu` (drop the unused `refresh` parameter from `buildMenu`; `createTray` still keeps a `refresh` closure that rebuilds the menu for shortcut changes):

```ts
function buildMenu(handlers: TrayHandlers): Menu {
  return Menu.buildFromTemplate([
    { label: 'Capture', accelerator: handlers.captureShortcut(), click: handlers.onCapture },
    { label: 'Open Editor', click: handlers.onOpenEditor },
    { type: 'separator' },
    {
      label: 'Open Captures Folder',
      click: () => void shell.openPath(handlers.captureRoot()),
    },
    { label: 'Settings…', click: handlers.onOpenSettings },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Check for Updates…', click: handlers.onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit Chop', role: 'quit' },
  ])
}

// in createTray:
const refresh = (): void => tray.setContextMenu(buildMenu(handlers))
```

`src/main/index.ts` — remove login-item import and tray fields:

```ts
// delete: import { openAtLoginState, setOpenAtLogin } from './login-item'
tray = createTray({
  onCapture: () => void capture(),
  onOpenEditor: () => getEditorWindow().show(),
  onOpenSettings: () => openSettingsWindow(),
  onCheckForUpdates: () => void checkForUpdates({ silent: false }),
  captureShortcut,
  captureRoot: () => captureRoot,
})
```

- [ ] **Step 4: Run tray tests — expect pass**

Run: `npm test -- tests/main/tray.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/main/tray.test.ts src/main/tray.ts src/main/index.ts
git commit -m "$(cat <<'EOF'
refactor: remove Open at Login from the tray menu

Preferences belong in Settings; keep the tray for capture actions.
EOF
)"
```

---

### Task 2: Login-item IPC for Settings

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/login-item-state.ts`
- Modify: `src/main/login-item.ts` (import path only if needed)
- Modify: `src/main/ipc/settings-handlers.ts`
- Modify: `src/preload/settings.ts`
- Create: `tests/main/settings-handlers-login.test.ts`
- Modify: `tests/main/login-item-state.test.ts` (imports only, if type moves)

**Interfaces:**
- Consumes: `openAtLoginState()`, `setOpenAtLogin(enabled: boolean)` from `src/main/login-item.ts`
- Produces:
  - `LoginItemState` in `@shared/ipc` = `'enabled' | 'disabled' | 'requires-approval' | 'unsupported'`
  - `CHANNELS.getOpenAtLogin` / `CHANNELS.setOpenAtLogin`
  - `chopSettings.getOpenAtLogin(): Promise<LoginItemState>`
  - `chopSettings.setOpenAtLogin(enabled: boolean): Promise<LoginItemState>`

- [ ] **Step 1: Write the failing IPC tests**

Create `tests/main/settings-handlers-login.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginItemState } from '../../src/shared/ipc'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle(channel: string, fn: (...args: unknown[]) => unknown) {
      handlers.set(channel, fn)
    },
    on() {},
  },
}))

const openAtLoginState = vi.fn((): LoginItemState => 'disabled')
const setOpenAtLogin = vi.fn((enabled: boolean): LoginItemState =>
  enabled ? 'enabled' : 'disabled',
)

vi.mock('../../src/main/login-item', () => ({
  openAtLoginState: () => openAtLoginState(),
  setOpenAtLogin: (enabled: boolean) => setOpenAtLogin(enabled),
}))

vi.mock('../../src/main/hotkeys', () => ({
  captureShortcut: () => 'CommandOrControl+Shift+2',
  changeCaptureShortcut: () => ({ ok: true, accelerator: 'CommandOrControl+Shift+2' }),
  resumeCaptureShortcut: () => {},
  suspendCaptureShortcut: () => {},
}))

vi.mock('../../src/main/settings-store', () => ({
  readSettings: () => ({ captureShortcut: 'CommandOrControl+Shift+2' }),
  writeSettings: () => {},
}))

vi.mock('../../src/main/settings-file', () => ({
  withCaptureShortcut: (s: unknown) => s,
}))

const { CHANNELS } = await import('../../src/shared/ipc')
const { registerSettingsHandlers } = await import('../../src/main/ipc/settings-handlers')

beforeEach(() => {
  handlers.clear()
  openAtLoginState.mockReset()
  setOpenAtLogin.mockReset()
  openAtLoginState.mockReturnValue('disabled')
  setOpenAtLogin.mockImplementation((enabled: boolean) => (enabled ? 'enabled' : 'disabled'))
  registerSettingsHandlers(() => {})
})

describe('open-at-login settings IPC', () => {
  it('reports the current login item state', () => {
    openAtLoginState.mockReturnValue('enabled')
    const result = handlers.get(CHANNELS.getOpenAtLogin)?.()
    expect(result).toBe('enabled')
  })

  it('forwards enable/disable to setOpenAtLogin and returns the OS state', () => {
    setOpenAtLogin.mockReturnValue('requires-approval')
    const result = handlers.get(CHANNELS.setOpenAtLogin)?.({}, true)
    expect(setOpenAtLogin).toHaveBeenCalledWith(true)
    expect(result).toBe('requires-approval')
  })

  it('rejects a non-boolean enable flag without calling the OS', () => {
    const result = handlers.get(CHANNELS.setOpenAtLogin)?.({}, 'yes')
    expect(setOpenAtLogin).not.toHaveBeenCalled()
    expect(result).toBe('disabled')
  })
})
```

- [ ] **Step 2: Run IPC tests — expect fail**

Run: `npm test -- tests/main/settings-handlers-login.test.ts`

Expected: FAIL — channels / handlers missing.

- [ ] **Step 3: Add shared type + channels**

In `src/shared/ipc.ts`, add:

```ts
export type LoginItemState = 'enabled' | 'disabled' | 'requires-approval' | 'unsupported'
```

And to `CHANNELS`:

```ts
  /** settings → main: whether Chop opens at login */
  getOpenAtLogin: 'chop:get-open-at-login',
  /** settings → main: enable/disable open at login; resolves with OS state */
  setOpenAtLogin: 'chop:set-open-at-login',
```

In `src/main/login-item-state.ts`, import and re-export the type so existing main code keeps working:

```ts
import type { LoginItemState } from '@shared/ipc'

export type { LoginItemState }
// keep LoginItemSettingsLike, supportsOpenAtLogin, loginItemState, notices as today
```

Update any file that defined `LoginItemState` locally only if imports break (`login-item.ts` already re-exports from `login-item-state`).

- [ ] **Step 4: Register handlers + preload bridge**

Append to `registerSettingsHandlers` in `src/main/ipc/settings-handlers.ts`:

```ts
import { openAtLoginState, setOpenAtLogin } from '../login-item'
import { CHANNELS, type LoginItemState, type ShortcutInfo, type ShortcutUpdate } from '@shared/ipc'

// inside registerSettingsHandlers:
ipcMain.handle(CHANNELS.getOpenAtLogin, (): LoginItemState => openAtLoginState())

ipcMain.handle(CHANNELS.setOpenAtLogin, (_event, enabled: unknown): LoginItemState => {
  if (typeof enabled !== 'boolean') return openAtLoginState()
  return setOpenAtLogin(enabled)
})
```

Extend `src/preload/settings.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type LoginItemState, type ShortcutInfo, type ShortcutUpdate } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopSettings', {
  platform: process.platform,
  getShortcut(): Promise<ShortcutInfo> {
    return ipcRenderer.invoke(CHANNELS.getShortcut) as Promise<ShortcutInfo>
  },
  setShortcut(accelerator: string): Promise<ShortcutUpdate> {
    return ipcRenderer.invoke(CHANNELS.setShortcut, accelerator) as Promise<ShortcutUpdate>
  },
  setRecording(recording: boolean): void {
    ipcRenderer.send(CHANNELS.recordShortcut, recording)
  },
  getOpenAtLogin(): Promise<LoginItemState> {
    return ipcRenderer.invoke(CHANNELS.getOpenAtLogin) as Promise<LoginItemState>
  },
  setOpenAtLogin(enabled: boolean): Promise<LoginItemState> {
    return ipcRenderer.invoke(CHANNELS.setOpenAtLogin, enabled) as Promise<LoginItemState>
  },
})
```

- [ ] **Step 5: Run IPC + login-item-state tests — expect pass**

Run: `npm test -- tests/main/settings-handlers-login.test.ts tests/main/login-item-state.test.ts tests/main/login-item.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/main/login-item-state.ts src/main/ipc/settings-handlers.ts src/preload/settings.ts tests/main/settings-handlers-login.test.ts
git commit -m "$(cat <<'EOF'
feat: expose open-at-login get/set over settings IPC

Settings can read and change login items without going through the tray.
EOF
)"
```

---

### Task 3: Sidebar Settings UI + General switch

**Files:**
- Modify: `src/main/settings-window.ts`
- Modify: `src/renderer/settings/index.html`
- Modify: `src/renderer/settings/main.ts`

**Interfaces:**
- Consumes: `chopSettings.getOpenAtLogin`, `chopSettings.setOpenAtLogin`, existing shortcut bridge + `createRecorder`
- Produces: Settings UI with sidebar; General default; Shortcuts pane unchanged in behavior

- [ ] **Step 1: Resize the settings window**

In `src/main/settings-window.ts`, set:

```ts
width: 600,
height: 380,
```

- [ ] **Step 2: Rebuild `index.html` as a sidebar shell**

Replace `src/renderer/settings/index.html` with a sidebar layout. Keep the existing shortcut field ids (`#shortcut`, `#reset`, `#status`) so `main.ts` can keep most shortcut logic. Key structure:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chop Settings</title>
    <style>
      :root {
        color-scheme: light dark;
        --accent: oklch(0.55 0.19 258);
        --muted: color-mix(in oklab, currentColor 55%, transparent);
        --line: color-mix(in oklab, currentColor 18%, transparent);
        --field: color-mix(in oklab, currentColor 6%, transparent);
        --sidebar: color-mix(in oklab, currentColor 6%, transparent);
      }
      html, body { margin: 0; height: 100%; font: 13px -apple-system, system-ui, sans-serif; user-select: none; }
      body { display: flex; height: 100%; box-sizing: border-box; }
      nav {
        flex: 0 0 148px;
        padding: 16px 10px;
        background: var(--sidebar);
        border-right: 1px solid var(--line);
        display: flex;
        flex-direction: column;
        gap: 4px;
        box-sizing: border-box;
      }
      nav button {
        text-align: left;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      nav button[aria-current="page"] { background: color-mix(in oklab, currentColor 12%, transparent); font-weight: 600; }
      nav button:hover { background: color-mix(in oklab, currentColor 8%, transparent); }
      main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 20px 24px; box-sizing: border-box; gap: 12px; }
      .pane { display: none; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
      .pane.active { display: flex; }
      h1 { margin: 0; font-size: 15px; font-weight: 600; }
      .row { display: flex; align-items: center; gap: 12px; }
      .row label { flex: 1; }
      #shortcut {
        flex: 1 1 auto; min-width: 0; padding: 8px 12px;
        border: 1px solid var(--line); border-radius: 8px; background: var(--field);
        color: inherit; font: 15px -apple-system, system-ui, sans-serif; text-align: center; cursor: pointer;
      }
      #shortcut:hover { border-color: color-mix(in oklab, currentColor 35%, transparent); }
      #shortcut.recording {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent);
        color: var(--muted);
      }
      #reset {
        flex: 0 0 auto; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px;
        background: transparent; color: inherit; font: inherit; cursor: pointer;
      }
      #reset:hover { background: var(--field); }
      #status { margin: 0; min-height: 32px; line-height: 1.4; color: var(--muted); }
      #status.error { color: oklch(0.58 0.19 25); }
      footer { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); line-height: 1.4; }
      #login-note { margin: 0; color: var(--muted); line-height: 1.4; }
      .switch {
        position: relative; width: 40px; height: 24px; flex: 0 0 auto;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .switch span {
        position: absolute; inset: 0; border-radius: 999px; background: color-mix(in oklab, currentColor 22%, transparent);
        cursor: pointer; transition: background 120ms ease;
      }
      .switch span::before {
        content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px;
        border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 120ms ease;
      }
      .switch input:checked + span { background: #34c759; }
      .switch input:checked + span::before { transform: translateX(16px); }
      .switch input:disabled + span { opacity: 0.5; cursor: default; }
    </style>
  </head>
  <body>
    <nav aria-label="Settings">
      <button type="button" data-pane="general" aria-current="page">General</button>
      <button type="button" data-pane="shortcuts">Shortcuts</button>
    </nav>
    <main>
      <section id="pane-general" class="pane active" aria-labelledby="general-title">
        <h1 id="general-title">General</h1>
        <div class="row" id="login-row">
          <label for="open-at-login">Open at Login</label>
          <label class="switch">
            <input id="open-at-login" type="checkbox" role="switch" />
            <span></span>
          </label>
        </div>
        <p id="login-note" hidden>Open at Login is not available on this system.</p>
      </section>
      <section id="pane-shortcuts" class="pane" aria-labelledby="shortcuts-title">
        <h1 id="shortcuts-title">Shortcuts</h1>
        <div class="row">
          <label for="shortcut">Capture</label>
          <button id="shortcut" type="button">…</button>
          <button id="reset" type="button">Restore Default</button>
        </div>
        <p id="status">Click the shortcut, then press the keys you want to use.</p>
        <footer>
          The capture shortcut works anywhere, so pick a combination other apps are
          unlikely to want.
        </footer>
      </section>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Wire pane switching + General switch in `main.ts`**

Update `src/renderer/settings/main.ts` to:

1. Extend the bridge type with `getOpenAtLogin` / `setOpenAtLogin`.
2. Add pane switching on nav buttons (`aria-current`, `.active` on sections).
3. On load, call `getOpenAtLogin()`:
   - `unsupported` → hide `#login-row`, show `#login-note`.
   - otherwise → `#open-at-login.checked = state === 'enabled'`.
4. On switch `change`:
   - `const next = await bridge.setOpenAtLogin(input.checked)`
   - `input.checked = next === 'enabled'` (OS wins; approval dialog may run in main).
5. Keep existing shortcut recorder / reset / blur logic intact inside the Shortcuts pane.

Skeleton for the new pieces (keep existing shortcut code):

```ts
type SettingsBridge = {
  platform: string
  getShortcut(): Promise<ShortcutInfo>
  setShortcut(accelerator: string): Promise<ShortcutUpdate>
  setRecording(recording: boolean): void
  getOpenAtLogin(): Promise<LoginItemState>
  setOpenAtLogin(enabled: boolean): Promise<LoginItemState>
}

import type { LoginItemState, ShortcutInfo, ShortcutUpdate } from '@shared/ipc'

const navButtons = document.querySelectorAll<HTMLButtonElement>('nav [data-pane]')
const panes = {
  general: document.querySelector<HTMLElement>('#pane-general')!,
  shortcuts: document.querySelector<HTMLElement>('#pane-shortcuts')!,
}

function showPane(id: 'general' | 'shortcuts'): void {
  for (const button of navButtons) {
    button.setAttribute('aria-current', button.dataset.pane === id ? 'page' : 'false')
  }
  panes.general.classList.toggle('active', id === 'general')
  panes.shortcuts.classList.toggle('active', id === 'shortcuts')
}

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const id = button.dataset.pane
    if (id === 'general' || id === 'shortcuts') showPane(id)
  })
}

const loginRow = document.querySelector<HTMLElement>('#login-row')!
const loginNote = document.querySelector<HTMLParagraphElement>('#login-note')!
const loginSwitch = document.querySelector<HTMLInputElement>('#open-at-login')!

function applyLoginState(state: LoginItemState): void {
  if (state === 'unsupported') {
    loginRow.hidden = true
    loginNote.hidden = false
    return
  }
  loginRow.hidden = false
  loginNote.hidden = true
  loginSwitch.checked = state === 'enabled'
}

loginSwitch.addEventListener('change', () => {
  void bridge
    .setOpenAtLogin(loginSwitch.checked)
    .then(applyLoginState)
    .catch((error: unknown) => {
      console.error('Could not change Open at Login.', error)
      void bridge.getOpenAtLogin().then(applyLoginState)
    })
})

void bridge
  .getOpenAtLogin()
  .then(applyLoginState)
  .catch((error: unknown) => {
    console.error('Could not read Open at Login.', error)
    applyLoginState('unsupported')
  })

// existing shortcut wiring stays below…
```

Default pane is General via HTML (`aria-current="page"` + `.active` on `#pane-general`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: PASS (fix any bridge typing issues).

- [ ] **Step 5: Manual sanity in dev (optional but recommended)**

Run: `npm run dev`

- Tray has no Open at Login.
- Settings… opens on General with the switch.
- Shortcuts pane still records Capture.
- On macOS, enabling when approval is needed shows the existing dialog; switch ends off until allowed.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings-window.ts src/renderer/settings/index.html src/renderer/settings/main.ts
git commit -m "$(cat <<'EOF'
feat: add sidebar Settings with Open at Login on General

Grow Settings beyond shortcuts and host the login preference there.
EOF
)"
```

---

### Task 4: Manual smoke docs

**Files:**
- Modify: `docs/manual-smoke-tests.md`

**Interfaces:**
- Consumes: shipped Settings + tray behavior from Tasks 1–3
- Produces: updated smoke checklist

- [ ] **Step 1: Update smoke tests**

Add a **Settings / Open at Login** section (or fold into Capture shortcut). Ensure checklist includes:

```markdown
## Settings
- [ ] Tray "Settings…" opens on the General pane
- [ ] Open at Login switch reflects the OS state and toggles it
- [ ] When macOS needs approval, the existing dialog appears; switch stays off until allowed
- [ ] Tray menu does not list Open at Login
- [ ] Shortcuts pane still shows and changes the Capture shortcut (see Capture shortcut below)
```

Adjust the first Capture shortcut bullet if it still assumes Settings opens directly onto the shortcut field:

```markdown
- [ ] Tray "Settings…" → Shortcuts shows the shortcut in force
```

- [ ] **Step 2: Commit**

```bash
git add docs/manual-smoke-tests.md
git commit -m "$(cat <<'EOF'
docs: smoke-test Settings General and Open at Login move

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Remove Open at Login from tray | Task 1 |
| Sidebar General \| Shortcuts | Task 3 |
| Default pane General | Task 3 |
| Keep approval dialog | Task 2 (unchanged `login-item.ts`) + Task 3 (sync switch from returned state) |
| Preserve shortcut recorder | Task 3 |
| Window 600×380, non-resizable | Task 3 |
| Switch on only when `enabled` | Task 3 `applyLoginState` |
| Unsupported → note, no switch | Task 3 |
| IPC get/set | Task 2 |
| Tray + IPC tests | Tasks 1–2 |
| Manual smoke | Task 4 |

No separate renderer unit test for pane switching (spec: optional; IPC + tray sufficient).
