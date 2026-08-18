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
- [ ] The sidebar lists General, Shortcuts, License and Feedback, and each pane opens

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

## Feedback
The send needs a real network and a real endpoint, so this cannot run in CI.
Point `FEEDBACK_URL` in `src/main/feedback/endpoint.ts` at something you can
watch — a request bin is enough — before starting.

- [ ] Tray "Send Feedback…" opens Settings on the Feedback pane
- [ ] Idea and Problem each show their own icon, and change the placeholder
- [ ] Send with an empty box says "Add a few words first" and raises no dialog
- [ ] "What's included" lists the running version, OS, display count and licence state
- [ ] Unticking the box leaves diagnostics out of both the dialog and the request
- [ ] Send raises a confirmation sheet listing the message and each diagnostics line
- [ ] Cancelling the sheet posts nothing, shows no error, and keeps the note
- [ ] Confirming posts, and the form is replaced by the thanks card
- [ ] "Send another" clears the box, the image and the status

Pasting an image:

- [ ] ⌘V with a screenshot on the clipboard shows the thumbnail, type and size
- [ ] The paste hint disappears once an image is attached
- [ ] The confirmation sheet names the pasted image
- [ ] The posted request carries the image as `capture`, decoded, not base64 text
- [ ] "Remove" drops it; the next send carries no file
- [ ] Pasting a second image replaces the first
- [ ] Pasting text still types into the box as normal
- [ ] Pasting something that is not an image Chop sends is refused with a message
- [ ] Typing, closing the window, and reopening restores the text but not the image
- [ ] A sent note does not come back as a draft

When it fails:

- [ ] With the network off, the note stays on screen and Copy text / Email instead appear
- [ ] "Copy text" puts the whole note on the clipboard, diagnostics included only if ticked
- [ ] "Email instead" opens the mail client with the subject and body filled in

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
The background network call needs a packaged build; `npm run dev` never checks automatically.
- [ ] Tray shows the running version, greyed out, above "Check for Updates…"
- [ ] With no newer release, "Check for Updates…" reports Chop is up to date
- [ ] With a newer release published, startup opens normally with no update prompt
- [ ] The newer release downloads, verifies, and stages silently in the background
- [ ] Once staged, Settings shows a **Relaunch to update** card with the new version
- [ ] Once staged, the main editor shows the same card at bottom-right, above the history strip
- [ ] The tray continues to show only **Check for Updates…**, with no relaunch action
- [ ] Clicking either action quits Chop, atomically replaces `Chop.app`, reopens it,
      and reports the new version in the tray
- [ ] Quitting without relaunching removes the staged copy and keeps the current app
- [ ] Running from a DMG, App Translocation, or an unwritable folder fails visibly
      without changing the installed app
- [ ] Offline, "Check for Updates…" reports the failure instead of hanging or crashing
- [ ] Before the first release exists, the check reports "No release has been published yet."
