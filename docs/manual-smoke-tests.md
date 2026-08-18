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
- [ ] The sidebar lists General, Shortcuts and License, and each pane opens

## Licensing
The trial clock and the blocking dialog need a real launch. `license.json` lives
beside `settings.json` in the app's user data directory; deleting it is how you
get back to a first-run state between passes.

Issue keys to test with:

    npm run license:keygen                 # once, then paste the public half in
    CHOP_LICENSE_PRIVATE_KEY=… npm run license:sign -- --email you@example.com

In a dev build, `CHOP_LICENSE_PUBLIC_KEY` overrides the built-in key so a
throwaway pair works without editing the source, and `CHOP_TRIAL_STARTED_AT`
pretends the trial began earlier:

    CHOP_TRIAL_STARTED_AT=-31d npm run dev    # trial ended
    CHOP_TRIAL_STARTED_AT=-28d npm run dev    # two days left

A packaged build ignores both. Since Screen Recording only works in a packaged
build, most of this list has to run there — use `npm run trial` to put the
installed app into each state, quitting Chop first:

    npm run trial                 # what the installed app currently sees
    npm run trial -- expired      # trial ended, capture refused
    npm run trial -- ending       # two days left
    npm run trial -- fresh        # first run: no key, no stamp
    npm run trial -- unlicense    # drop the key, keep the trial stamp

- [ ] First launch with no `license.json` writes one, stamped with today
- [ ] Tray shows "Trial — 30 days left" and offers "Enter Licence…"
- [ ] Capture works normally throughout the trial
- [ ] Relaunching does not move the stamp or extend the trial
- [ ] With the stamp backdated past 30 days, capture is refused with the "Trial ended" dialog
- [ ] A packaged build ignores `CHOP_TRIAL_STARTED_AT` entirely
- [ ] "Enter Licence…" in that dialog opens Settings on the License pane
- [ ] "Buy Chop" opens the store in the browser; "Not Now" dismisses without capturing
- [ ] Holding the capture hotkey down does not stack dialogs
- [ ] Pasting a genuine key activates it, and the tray switches to "Licensed" without a relaunch
- [ ] Capture works again immediately, with no relaunch
- [ ] The key survives a relaunch, and activation works with no network
- [ ] A key signed by a different pair is refused and does not replace an installed one
- [ ] A key pasted with line breaks in it still activates
- [ ] "Remove" asks first, as a sheet on the Settings window, with Cancel as the default
- [ ] Cancelling leaves the licence in place and says nothing about a removal
- [ ] Confirming clears the key and falls back to the trial state, which has not reset
- [ ] A key with `--days 1`, backdated past its term, reports "Licence expired"
- [ ] Editing past captures still works while capture is blocked

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
- [ ] "Download and Install" opens an in-app progress window; no browser opens
- [ ] Progress shows a percentage and downloaded/total megabytes, and the Dock
      progress indicator follows it
- [ ] Cancelling during download closes the updater and leaves the installed app unchanged
- [ ] After download, the control disables while Chop verifies and stages the app
- [ ] A completed update quits Chop, atomically replaces `Chop.app`, relaunches,
      and reports the new version in the tray
- [ ] Running from a DMG, App Translocation, or an unwritable folder fails visibly
      without changing the installed app
- [ ] Offline, "Check for Updates…" reports the failure instead of hanging or crashing
- [ ] Before the first release exists, the check reports "No release has been published yet."
