# Daily usage analytics

Date: 2026-08-19  
Status: approved

## Problem

There is no way to tell whether anyone actually uses Chop after installing it.
Feedback only arrives from the small number of people who choose to write, and
the licence system is offline by design, so a sale tells us nothing about what
happened afterwards. We cannot currently answer:

- Are people capturing daily, weekly, or once and never again?
- How many captures does an active user make in a day?
- Do trial users convert, and do licensed users stay active?
- Which app and macOS versions are actually in the field?

## Goals

- One `POST` per device per day carrying counts and licence state.
- A device identity that is stable across app reinstall, so a returning
  machine is recognised rather than counted as new.
- Enough on each row to chart activity by customer without a join: licence
  email included for licensed devices, `NULL` for trial devices.
- Offline-tolerant: a machine that is off the network for a week loses no
  counts.
- Never delays startup, never blocks quit, never surfaces an error to the user.

## Non-goals

- Per-action event streams, funnels, or session replay. Daily aggregates only.
- A third-party analytics SDK. Nothing new in `dependencies`.
- Any content from captures: no image bytes, dimensions, filenames, paths,
  window titles, or OCR text.
- Crash or performance reporting. Separate concern, separate design.
- Retro-reporting days that happened before this ships.
- Windows or Linux support. macOS only, matching the rest of the app.

## Decisions

| Topic | Choice |
| --- | --- |
| Device id | `IOPlatformUUID` from IOKit, HMAC-SHA256'd before it leaves the machine |
| Reinstall persistence | Yes — the id is hardware-derived, not stored-random |
| Cadence | Once per local calendar day |
| Transport | `POST https://api.chop.asia/usage`, JSON, unauthenticated |
| Email on the wire | Yes, inside the signed licence token — verified server-side |
| Email for trial users | `NULL` |
| Counter reset | Only on a `2xx`; failures accumulate |
| Storage | `usage.json` in `userData`, separate from `settings.json` |
| Opt out | `usageEnabled` in Settings → General, default on |
| Server store | Cloudflare D1, upsert on `(device_id, day)` |
| Averages | Computed server-side at query time, never in the app |

## Design

### 1. Device identity

macOS exposes a per-machine UUID that survives app reinstall and OS reinstall:

```
ioreg -rd1 -c IOPlatformExpertDevice
```

The output contains a line of the form `"IOPlatformUUID" = "…"`. Parse the
quoted value.

**The raw UUID never leaves the machine.** Every other app on the Mac can read
the same value, so sending it raw would put a cross-app-linkable hardware
identifier in our database. Send instead:

```
deviceId = hmacSha256(key: USAGE_ID_SALT, message: IOPlatformUUID) → lowercase hex
```

`USAGE_ID_SALT` is a build constant (`'chop-usage-v1'`). It ships inside the
binary, so it is not a secret and must not be treated as one — its only job is
to make the id meaningless outside Chop. The version suffix exists so the id
space can be rotated later without confusing it with the old one.

Read `ioreg` **once, ever**: the result is cached in `usage.json` and the
subprocess never runs again on that machine. Spawn with a 2 s timeout.

If the read fails, times out, or yields no UUID — a VM, a locked-down
environment, a future macOS change — fall back to `randomUUID()` and record
`idSource: 'random'`. Such a device will look new after a reinstall; the field
exists so those rows can be excluded when reasoning about retention rather than
silently polluting it.

Machines whose logic board is replaced get a new `IOPlatformUUID`. Accept it.

### 2. Usage state — `usage.json`

New file in `app.getPath('userData')`, alongside `settings.json` and
`license.json`. It is deliberately **not** part of `ChopSettings`: these
counters are rewritten on every capture, and user preferences should not churn
like that.

```jsonc
{
  "deviceId": "9f2c…",          // cached hash, written once
  "idSource": "hardware",        // 'hardware' | 'random'
  "captures": 3,                 // pending, unreported
  "imagesSaved": 2,
  "imagesCopied": 1,
  "pendingSince": "2026-08-18T09:12:44.101Z",  // null before the first report
  "lastReportedDay": "2026-08-18"              // null before the first report
}
```

Follow the `settings-file.ts` / `settings-store.ts` split exactly: a pure
parse/serialize module with no `electron` import so it can be asserted in
tests, and a store module that owns the path and the cache. `parseUsageFile`
must never throw — a missing, truncated, or hand-edited file falls back to
defaults, the same contract `parseSettings` holds.

Writes are frequent but tiny. Keep the in-memory copy authoritative and let a
failed write cost the next launch, matching `writeSettings`.

### 3. Counters

Three counters, incremented at these exact call sites:

| Counter | Call site | Condition |
| --- | --- | --- |
| `captures` | `runCaptureFlow()` in `src/main/capture/capture-flow.ts` | Increment when it returns non-null, so a cancelled overlay does not count |
| `imagesSaved` | `CHANNELS.saveCapture` and `CHANNELS.saveCaptureAs` handlers in `src/main/ipc/editor-handlers.ts` | After the write succeeds |
| `imagesCopied` | `CHANNELS.copyCapture` handler in `src/main/ipc/editor-handlers.ts` | After the empty-image guard, once `clipboard.writeImage` has run |

Each increment is one call to `recordUsage('captures')` — the counting module
owns the read-modify-write, so no call site knows the file exists. Counters are
plain monotonic integers, reset to zero only by a successful report.

Counting continues even when `usageEnabled` is off. The numbers never leave the
machine in that case, and keeping the call sites unconditional avoids scattering
a settings check through the capture path.

### 4. Day rollover and scheduling

A report is due when the local calendar day differs from `lastReportedDay`.

Two triggers:

- **Startup**, after a `STARTUP_DELAY_MS` of 30 s, so it never competes with
  window creation or the first capture.
- **A 30-minute poll** (`ROLLOVER_CHECK_MS`) that re-asks the same question.

The poll is deliberately not a timer aimed at midnight. Chop is a tray app that
stays running for days, across sleep, wake, timezone changes, and DST — a
30-minute poll is correct through all of them and a midnight timer is not.

Local day, not UTC: `YYYY-MM-DD` formatted in the machine's zone. A user's "day"
is their day.

Keep the due-check pure — `isReportDue(lastReportedDay, now, timeZone)` — so the
rollover can be asserted against fixed clocks the way `trial.ts` is.

### 5. Wire format

```ts
type UsageReport = {
  readonly schema: 1
  readonly deviceId: string
  readonly idSource: 'hardware' | 'random'

  /** Local calendar day the report is filed under, YYYY-MM-DD. */
  readonly day: string
  /** When the counters started accumulating; null on the first ever report. */
  readonly since: string | null

  readonly captures: number
  readonly imagesSaved: number
  readonly imagesCopied: number

  readonly license: {
    readonly kind: 'licensed' | 'expired' | 'invalid' | 'trial' | 'trial-expired'
    /** The stored CHOP1 key, or null when none is stored. Verified, then discarded. */
    readonly token: string | null
    /** Only on an active trial, else null. */
    readonly trialDaysLeft: number | null
  }

  readonly appVersion: string
  readonly osVersion: string
  readonly arch: string
}
```

`license.kind` and `trialDaysLeft` come straight off `currentLicenseStatus()` —
no new branching. `appVersion` / `osVersion` / `arch` are already assembled in
`collectDiagnostics()`; extract that trio into a shared helper and have both
feedback and usage use it rather than duplicating the three lines.

**Why the token rather than a plain email field.** The endpoint is
unauthenticated — anything shipped in the binary is not a secret, so a bare
`email` string would be something anyone could POST, and there would be no way
to tell a real customer row from a fabricated one. The licence key already
carries the email inside an Ed25519 signature, so sending the key lets the
server prove the row belongs to a real licence. The raw token is verified and
then **discarded**: only `email`, `id`, and `edition` are stored.

After an offline stretch, one report covers several days. `since` makes the span
explicit so the server can divide by it when precision matters.

### 6. Sending

Mirror `postFeedback` in shape: network trouble is a returned result, never a
throw, and never anything the user sees.

- `https://` only, checked before the call, same rule as `isSafeFeedbackUrl`.
- `AbortSignal.timeout(USAGE_TIMEOUT_MS)`, 10 s. The payload is a few hundred
  bytes; a slow network is not worth waiting on.
- `2xx` → set `lastReportedDay` to the reported day, set `pendingSince` to now,
  zero all three counters, write the file.
- Anything else, including `429` and a thrown fetch → change nothing. Counters
  keep accumulating and the next trigger tries again. **Never retry in a loop**;
  the next poll is the retry.
- Failures log at most one `console.warn`. No dialog, no tray badge, no IPC to
  any renderer.
- Guard on `app.isPackaged`: an unpackaged build never sends. Honour a
  `CHOP_USAGE_URL` env override in development so it can be pointed at a local
  Worker.

Send from the main process only. No renderer ever sees this payload or the
licence token.

### 7. Consent and disclosure

- Add `usageEnabled: boolean` to `ChopSettings`, default `true`, with a
  `withUsageEnabled` updater, following `withCaptureShortcut`.
- Settings → **General** gets a switch: **"Share anonymous usage data"**.
- Beneath it, a disclosure in the manner of the Feedback pane's "What's
  included", listing the literal contents: a device identifier, daily counts of
  captures, saves and copies, app and macOS version, and licence state. It must
  say plainly that a licensed copy includes the licence email, and that trial
  copies are counted without one.
- Turning it off stops all sending immediately, including a report already due.

Chop holds Screen Recording permission. Telemetry that a user discovers rather
than reads about is disproportionately damaging for this category of app, so the
disclosure is part of the feature, not a follow-up.

### 8. Server — endpoint contract

`POST https://api.chop.asia/usage`, `Content-Type: application/json`.

| Status | Meaning | Client behaviour |
| --- | --- | --- |
| `2xx` | Accepted | Reset counters |
| `400` | Malformed body | Treat as failure, do not reset |
| `429` | Rate limited | Treat as failure, wait for the next poll |
| `5xx` | Server trouble | Treat as failure |

Response body is ignored.

Worker responsibilities:

1. Validate the body shape; reject anything unrecognised with `400`.
2. Clamp each counter to `MAX_DAILY_COUNT` (10 000). The endpoint is open;
   the numbers must stay sane.
3. Rate-limit per IP. **Do not store the IP.**
4. If `license.token` is present, verify and extract:

```js
let email = null, licenseId = null, edition = null
if (report.license.token) {
  const token = decodeLicenseToken(report.license.token)
  const ok = token && await crypto.subtle.verify(
    'Ed25519', publicKey, token.signature, signedBytes(token.signed),
  )
  if (ok) {
    const claims = parseClaims(token.payload)
    if (claims) ({ email, id: licenseId, edition } = claims)
  }
}
```

   A token that fails verification is treated as absent — the row is written
   with `email = NULL` rather than rejected, so a corrupt key still counts as
   activity.

5. Upsert the row. Never persist `report.license.token`.

`decodeLicenseToken`, `signedBytes`, and `parseClaims` are pure and free of
Electron imports. Either publish `src/shared/license/` as a small shared package
or vendor those three files into the API repo — do not reimplement them.

### 9. Server — schema

```sql
CREATE TABLE device (
  device_id     TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  id_source     TEXT NOT NULL
);

CREATE TABLE usage_day (
  device_id       TEXT NOT NULL,
  day             TEXT NOT NULL,
  since           TEXT,
  captures        INTEGER NOT NULL,
  images_saved    INTEGER NOT NULL,
  images_copied   INTEGER NOT NULL,
  license_kind    TEXT NOT NULL,
  email           TEXT,
  license_id      TEXT,
  edition         TEXT,
  trial_days_left INTEGER,
  app_version     TEXT NOT NULL,
  os_version      TEXT NOT NULL,
  PRIMARY KEY (device_id, day)
);

CREATE INDEX usage_day_email ON usage_day (email);
CREATE INDEX usage_day_day   ON usage_day (day);
```

`email` is populated for `licensed` and `expired` — an expired licence still has
a real buyer behind it, and that is exactly the row worth seeing when looking at
churn. `NULL` for `trial`, `trial-expired`, and `invalid`.

`INSERT … ON CONFLICT (device_id, day) DO UPDATE` makes retries idempotent,
which matters because a client that sends successfully but fails to write
`usage.json` will resend the same day.

`device.first_seen_at` is set on the first ever row for that id and never
updated. A device reporting `trial` with a full `trial_days_left` months after
its `first_seen_at` is a trial reset — worth being able to see.

The queries this is designed to answer:

```sql
-- Average captures per active day, per customer
SELECT email, AVG(captures) AS avg_captures, COUNT(*) AS active_days
FROM usage_day WHERE email IS NOT NULL GROUP BY email ORDER BY avg_captures DESC;

-- Images created yesterday, across everyone
SELECT SUM(images_saved + images_copied) FROM usage_day WHERE day = date('now', '-1 day');

-- Active devices per day, split by licence state
SELECT day, license_kind, COUNT(DISTINCT device_id)
FROM usage_day GROUP BY day, license_kind ORDER BY day DESC;
```

## File layout

**New — `src/main/usage/`**

| File | Holds |
| --- | --- |
| `endpoint.ts` | `USAGE_URL`, `USAGE_TIMEOUT_MS`, `isSafeUsageUrl` |
| `device-id.ts` | `ioreg` spawn, `parseIOPlatformUUID` (pure), HMAC, random fallback |
| `usage-file.ts` | `UsageFile` type, `parseUsageFile`, `serializeUsageFile`, pure updaters |
| `usage-store.ts` | Path, cache, `readUsage` / `writeUsage`, `recordUsage(counter)` |
| `report.ts` | `isReportDue`, `localDay`, `buildReport` — all pure |
| `send-usage.ts` | `postUsage(report, url?, fetchImpl?)` returning a result |
| `index.ts` | `startUsageReporting()` / `stopUsageReporting()`, the scheduler |

**Modified**

| File | Change |
| --- | --- |
| `src/main/settings-file.ts` | `usageEnabled` field, default `true`, `withUsageEnabled` |
| `src/main/index.ts` | `startUsageReporting()` beside the other registrations; `stopUsageReporting()` on quit |
| `src/main/capture/capture-flow.ts` | Increment `captures` on a non-null return |
| `src/main/ipc/editor-handlers.ts` | Increment `imagesSaved` / `imagesCopied` |
| `src/main/feedback/diagnostics.ts` | Extract the version/OS/arch trio for reuse |
| `src/main/ipc/settings-handlers.ts` | Get/set channels for `usageEnabled` |
| `src/preload/settings.ts` | Expose them |
| `src/renderer/settings/*` | General pane switch + disclosure |
| `src/shared/ipc.ts` | New channel names |

## Errors

- **`ioreg` fails or times out** — fall back to a random id, mark
  `idSource: 'random'`, carry on. Never retried at runtime; the cached value
  stands until `usage.json` is deleted.
- **`usage.json` unreadable or corrupt** — defaults, which means a new random
  device id. Log once. Do not delete the file.
- **`usage.json` write fails** — keep the in-memory copy, log once. Worst case
  a day is re-reported, which the upsert absorbs.
- **Send fails for any reason** — counters untouched, one `console.warn`,
  nothing user-visible. Silent to the user by design: a failed analytics call is
  not their problem.
- **Licence unreadable (`invalid`)** — still report, with `token` sent as stored
  and `email` resolving to `NULL` server-side. An unreadable licence is a
  meaningful signal.
- **Quit during a send** — abandon it. Never delay quit for a report.

## Testing

**Automated** — the pure modules carry the coverage, matching how `trial.ts` and
`send-feedback.ts` are tested today.

- `parseIOPlatformUUID`: real `ioreg` output, output with the key absent,
  truncated output, empty string.
- Device id: a fixed UUID in, a known hex digest out; the random fallback sets
  `idSource: 'random'`.
- `parseUsageFile`: valid, missing, truncated, wrong types, unknown extra keys.
- `isReportDue` / `localDay`: same day, next day, month and year boundaries, a
  clock that has gone backwards, `lastReportedDay` null.
- Counter updaters: increment returns a new object and does not mutate its
  input, per the immutability rule.
- `buildReport`: each of the five `LicenseStatus` kinds produces the right
  `kind`, `token`, and `trialDaysLeft`.
- `postUsage` with an injected `fetchImpl`: `200` resets, `400` / `429` / `500`
  do not, a thrown fetch does not, a non-`https` URL refuses to send.
- Settings: `usageEnabled` round-trips and defaults to `true` when absent.

**Manual smoke** — add to `docs/manual-smoke-tests.md`:

- Fresh install reports once; a second launch the same day does not.
- Delete the app and reinstall — the server sees the same `device_id`.
- With the switch off, no request is made even when a report is due.
- Activating a licence changes the next row from `NULL` email to the buyer's.
- Airplane mode for two days, then reconnect: one row lands, counts intact,
  `since` spanning both days.

## Out of scope follow-ups

- A dashboard over D1. The SQL above is the interim answer.
- Retention cohorts and trial-reset reporting built on `first_seen_at`.
- Per-tool counts (arrow, callout, crop) once daily totals prove useful.
- Crash and performance reporting.
- A privacy policy page at chop.asia to link from the disclosure.
- Windows and Linux device identity, if Chop ever ships there.
