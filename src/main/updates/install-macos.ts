import { execFile as execFileCallback, spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export type PreparedMacUpdate = {
  /** Starts the detached swap helper. The caller should quit immediately after this resolves. */
  readonly launchReplacement: () => Promise<void>
  /** Unmounts and removes staged files if handoff cannot be completed. */
  readonly discard: () => Promise<void>
}

export function installedAppPath(execPath: string): string | null {
  const target = resolve(execPath, '../../..')
  const expectedSuffix = `${sep}Contents${sep}MacOS${sep}${basename(execPath)}`
  if (basename(target) !== 'Chop.app' || !execPath.endsWith(expectedSuffix)) return null
  if (target.includes(`${sep}AppTranslocation${sep}`)) return null
  if (target.startsWith(`${sep}Volumes${sep}`)) return null
  return target
}

export function versionFromTag(tag: string): string | null {
  const match = /^v?(\d+\.\d+\.\d+)$/.exec(tag)
  return match?.[1] ?? null
}

/** Exported so its rollback behavior can be asserted without replacing an app in tests. */
export const REPLACEMENT_SCRIPT = `#!/bin/sh
set -u

pid="$1"
staged_app="$2"
target_app="$3"
stage_dir="$4"
mount_point="$5"
working_dir="$6"
log_file="$7"
backup_app="$stage_dir/previous.app"

exec >>"$log_file" 2>&1
echo "Waiting for Chop process $pid to exit"
while /bin/kill -0 "$pid" 2>/dev/null; do /bin/sleep 0.2; done

if ! /bin/mv "$target_app" "$backup_app"; then
  echo "Could not move the installed app aside"
  /usr/bin/hdiutil detach "$mount_point" -quiet || true
  exit 1
fi

if ! /bin/mv "$staged_app" "$target_app"; then
  echo "Could not move the update into place; restoring the previous app"
  /bin/mv "$backup_app" "$target_app" || true
  /usr/bin/hdiutil detach "$mount_point" -quiet || true
  /usr/bin/open "$target_app" || true
  exit 1
fi

echo "Update installed; reopening Chop"
/usr/bin/hdiutil detach "$mount_point" -quiet || true
/usr/bin/open "$target_app"
/bin/rm -rf "$backup_app" "$stage_dir" "$working_dir"
`

async function plistValue(appPath: string, key: string): Promise<string> {
  const plist = join(appPath, 'Contents', 'Info.plist')
  const { stdout } = await execFile('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])
  return stdout.trim()
}

async function detach(mountPoint: string): Promise<void> {
  await execFile('/usr/bin/hdiutil', ['detach', mountPoint, '-quiet']).catch(() => undefined)
}

/**
 * Mounts and validates the DMG, then stages Chop beside the running app. The
 * final same-volume rename is delegated to a tiny process that outlives Chop.
 */
export async function prepareMacUpdate(
  dmgPath: string,
  tag: string,
  execPath: string,
  pid: number,
  logsDirectory: string,
  workingDirectory: string,
): Promise<PreparedMacUpdate> {
  const targetApp = installedAppPath(execPath)
  if (!targetApp) {
    throw new Error('Automatic updates require Chop to be installed as Chop.app outside App Translocation.')
  }
  const expectedVersion = versionFromTag(tag)
  if (!expectedVersion) throw new Error(`The update version ${tag} is invalid.`)

  const targetStat = await lstat(targetApp)
  if (!targetStat.isDirectory()) throw new Error('The running Chop application could not be found.')

  const mountPoint = join(workingDirectory, 'mounted')
  await mkdir(mountPoint)
  let mounted = false
  let stageDirectory: string | null = null

  try {
    await execFile('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mountPoint,
      dmgPath,
    ])
    mounted = true

    const sourceApp = join(mountPoint, 'Chop.app')
    const sourceRealPath = await realpath(sourceApp)
    const mountRealPath = await realpath(mountPoint)
    if (!sourceRealPath.startsWith(`${mountRealPath}${sep}`)) {
      throw new Error('The installer contains an unsafe application path.')
    }
    if ((await plistValue(sourceApp, 'CFBundleIdentifier')) !== 'com.sonnypham.chop') {
      throw new Error('The installer contains the wrong application.')
    }
    if ((await plistValue(sourceApp, 'CFBundleShortVersionString')) !== expectedVersion) {
      throw new Error('The installer version does not match the release version.')
    }

    const executable = join(sourceApp, 'Contents', 'MacOS', 'Chop')
    const { stdout: architectures } = await execFile('/usr/bin/lipo', ['-archs', executable])
    if (!architectures.trim().split(/\s+/).includes(process.arch)) {
      throw new Error(`The installer does not contain the ${process.arch} application.`)
    }

    stageDirectory = await mkdtemp(join(dirname(targetApp), '.chop-update-'))
    const stagedApp = join(stageDirectory, 'Chop.app')
    await execFile('/usr/bin/ditto', [sourceApp, stagedApp])

    const scriptPath = join(workingDirectory, 'replace.sh')
    const logFile = join(logsDirectory, 'update.log')
    await writeFile(scriptPath, REPLACEMENT_SCRIPT, { mode: 0o700 })

    const discard = async (): Promise<void> => {
      await detach(mountPoint)
      await rm(stageDirectory as string, { recursive: true, force: true })
      await rm(workingDirectory, { recursive: true, force: true })
    }

    return {
      launchReplacement: () =>
        new Promise<void>((resolveLaunch, rejectLaunch) => {
          const child = spawn(
            '/bin/sh',
            [
              scriptPath,
              String(pid),
              stagedApp,
              targetApp,
              stageDirectory as string,
              mountPoint,
              workingDirectory,
              logFile,
            ],
            { detached: true, stdio: 'ignore' },
          )
          child.once('error', rejectLaunch)
          child.once('spawn', () => {
            child.unref()
            resolveLaunch()
          })
        }),
      discard,
    }
  } catch (error) {
    if (mounted) await detach(mountPoint)
    if (stageDirectory) await rm(stageDirectory, { recursive: true, force: true })
    await rm(workingDirectory, { recursive: true, force: true })
    throw error
  }
}
