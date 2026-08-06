# Taste

- Prefers verifying macOS permission-related features on a packaged app build (DMG) rather than dev mode, because dev mode registers as "Electron" in System Settings. Confidence: 0.8
- Wants the default capture hotkey to stay Cmd+Shift+2 on macOS; hotkey experiments that don't work should be reverted. Confidence: 0.6
- Expects each bug fix to be verified end-to-end (typecheck, tests, rebuild) before delivery; reports "still not working" plainly when a fix doesn't hold in practice. Confidence: 0.7
- When asked to commit and push, expects the full flow in one pass: review the diff to understand the change, write a descriptive commit message explaining what and why, run tests to verify, commit only the files relevant to the change (project config/taste files get their own separate commit rather than being mixed in), then push and confirm the result — without pausing for step-by-step confirmation. Confidence: 0.95
- Wants Command Code project config and taste files (`.commandcode/`) tracked in version control — pointing at a taste file and saying "commit and push" means commit those files too (e.g., as a `chore:` commit), not leave them out of the repo. Confidence: 0.7
- Expects the assistant to perform tool restarts/reloads directly (e.g., running `/reload`) when setup changes require them, rather than being asked to restart the app itself. Confidence: 0.6
