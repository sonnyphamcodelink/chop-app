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
