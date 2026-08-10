# Manual smoke tests

These exercise platform code that cannot run in CI.

## macOS window provider
- [ ] `./resources/windowlist` prints a JSON array with plausible bounds
- [ ] Hovering the capture overlay highlights the correct window, front-most first
- [ ] Highlighting is correct on a secondary display, including one left of the primary
- [ ] Quitting an app removes it from the highlight list on the next capture

## Windows window provider
- [ ] Hovering highlights the correct window
- [ ] Highlight bounds exclude the drop shadow (DWM extended frame bounds)
- [ ] Highlighting is correct on a secondary display

## Permissions (macOS)
- [ ] With Screen Recording denied, capture shows guidance and opens System Settings
- [ ] After granting and relaunching, capture works

## Settings
- [ ] Tray "Settings…" opens on the General pane
- [ ] Open at Login switch reflects the OS state and toggles it
- [ ] When macOS needs approval, the existing dialog appears; switch stays off until allowed
- [ ] Tray menu does not list Open at Login
- [ ] Shortcuts pane still shows and changes the Capture shortcut (see Capture shortcut below)

## Capture shortcut
The global hotkey itself only registers with the OS in a running app.
- [ ] Tray "Settings…" → Shortcuts shows the shortcut in force
- [ ] Recording a new chord captures with it straight away, and the tray label follows
- [ ] The chosen shortcut survives a relaunch
- [ ] While recording, pressing the current shortcut records it instead of capturing
- [ ] A chord another app owns is refused, and the previous shortcut still captures
- [ ] Escape, clicking away, and closing the window mid-recording all leave the hotkey working
- [ ] "Restore Default" puts capture back on ⇧⌘2
- [ ] The editor's "Press … to capture" placeholder tracks the change without a relaunch

## Updates
The dialog and the network call need a packaged build; `npm run dev` never checks.
- [ ] Tray shows the running version, greyed out, above "Check for Updates…"
- [ ] With no newer release, "Check for Updates…" reports Chop is up to date
- [ ] With a newer release published, launching the app offers it unprompted
- [ ] "Download" opens the release page in the browser; "Later" dismisses it
- [ ] Offline, "Check for Updates…" reports the failure instead of hanging or crashing
- [ ] Before the first release exists, the check reports "No release has been published yet."
