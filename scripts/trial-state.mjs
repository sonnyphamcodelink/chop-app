/**
 * Puts the installed app's trial into a chosen state, for testing a packaged
 * build the way a customer runs it.
 *
 *     npm run trial                    # show the state as it stands
 *     npm run trial -- expired         # trial ended, capture refused
 *     npm run trial -- ending          # two days left
 *     npm run trial -- fresh           # first run: no key, no stamp
 *     npm run trial -- unlicense       # drop the key, keep the trial stamp
 *     npm run trial -- days-ago 20     # trial began exactly N days ago
 *
 * A packaged build ignores `CHOP_TRIAL_STARTED_AT` on purpose, so this edits
 * `license.json` in the app's user data directory — the same file the app
 * writes. Quit Chop first: it caches the file in memory and would write its
 * copy back over yours.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DAY_MS = 24 * 60 * 60 * 1000

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Read from the source of truth rather than restated, so the two cannot drift. */
function readTrialDays() {
  const source = readFileSync(resolve('src/shared/license/trial.ts'), 'utf8')
  const days = Number(/export const TRIAL_DAYS = (\d+)/.exec(source)?.[1])
  if (!Number.isFinite(days)) fail('Could not read TRIAL_DAYS from src/shared/license/trial.ts.')
  return days
}

/** electron-builder's productName is what Electron names the data directory. */
function readProductName() {
  const config = readFileSync(resolve('electron-builder.yml'), 'utf8')
  return /^productName:\s*(.+)$/m.exec(config)?.[1]?.trim() ?? 'Chop'
}

function userDataDir(productName) {
  // Test seam, so the script's own tests never touch a real installation.
  const override = process.env.CHOP_USER_DATA?.trim()
  if (override) return override

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', productName)
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) fail('APPDATA is not set, so the user data directory cannot be found.')
    return join(appData, productName)
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), productName)
}

/** A running app would write its cached copy back over whatever we set. */
function warnIfRunning() {
  if (process.platform !== 'darwin') return
  try {
    execFileSync('pgrep', ['-f', 'Chop.app/Contents/MacOS'], { stdio: 'pipe' })
    console.warn('Chop looks like it is running. Quit it first, or it will overwrite this.\n')
  } catch {
    // pgrep exits non-zero when nothing matches, which is the case we want.
  }
}

function readFile(path) {
  if (!existsSync(path)) return { key: null, trialStartedAt: null }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return { key: raw?.key ?? null, trialStartedAt: raw?.trialStartedAt ?? null }
  } catch {
    console.warn('The existing license.json was not readable; treating it as empty.\n')
    return { key: null, trialStartedAt: null }
  }
}

function write(path, file) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
}

function describe(file, trialDays) {
  if (file.key) {
    // Whether it verifies is the app's business; this only reports what is set.
    console.info('  key            installed')
  } else {
    console.info('  key            none')
  }

  if (!file.trialStartedAt) {
    console.info(`  trial          not started — next launch begins ${trialDays} days`)
    return
  }

  const startedAt = Date.parse(file.trialStartedAt)
  if (!Number.isFinite(startedAt)) {
    console.info(`  trial          unreadable stamp (${file.trialStartedAt})`)
    return
  }

  const endsAt = startedAt + trialDays * DAY_MS
  const daysLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / DAY_MS))
  console.info(`  trial started  ${file.trialStartedAt}`)
  console.info(`  trial          ${daysLeft === 0 ? 'ended' : `${daysLeft} day(s) left`}`)
}

const trialDays = readTrialDays()
const path = join(userDataDir(readProductName()), 'license.json')

// Plain words, no flags. A dashed flag is easy to lose to a shell that does not
// split it the way the caller expected, and losing one silently did nothing at
// all — where an unknown word is caught and reported below.
const [command = 'status', ...rest] = process.argv.slice(2)

function stampFor(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

const current = readFile(path)
console.info(`${path}\n`)

if (command !== 'status') warnIfRunning()

switch (command) {
  case 'status':
    describe(current, trialDays)
    break

  case 'expired':
    // Backdated past the term, and the key cleared, since a licence outranks
    // the trial and would hide the state being tested.
    write(path, { key: null, trialStartedAt: stampFor(trialDays + 1) })
    console.info('Trial ended, licence removed. Capture will be refused.\n')
    describe(readFile(path), trialDays)
    break

  case 'ending':
    write(path, { key: null, trialStartedAt: stampFor(trialDays - 2) })
    console.info('Trial has two days left, licence removed.\n')
    describe(readFile(path), trialDays)
    break

  case 'fresh':
    rmSync(path, { force: true })
    console.info(`Licence file removed. The next launch begins a new ${trialDays}-day trial.`)
    break

  case 'unlicense':
    write(path, { ...current, key: null })
    console.info('Licence removed; the trial stamp is untouched.\n')
    describe(readFile(path), trialDays)
    break

  case 'days-ago': {
    const days = Number(rest[0])
    if (!Number.isFinite(days) || days < 0) {
      fail('days-ago needs a number of days, e.g. `npm run trial -- days-ago 20`')
    }
    write(path, { key: null, trialStartedAt: stampFor(days) })
    console.info(`Trial started ${days} day(s) ago, licence removed.\n`)
    describe(readFile(path), trialDays)
    break
  }

  default:
    fail(
      `Unknown command "${command}".\n` +
        'Use one of: status, expired, ending, fresh, unlicense, days-ago <n>',
    )
}
