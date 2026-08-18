import { describe, expect, it } from 'vitest'
import {
  installedAppPath,
  REPLACEMENT_SCRIPT,
  versionFromTag,
} from '../../../src/main/updates/install-macos'

describe('installedAppPath', () => {
  it('finds the app bundle that owns the running executable', () => {
    expect(installedAppPath('/Applications/Chop.app/Contents/MacOS/Chop')).toBe(
      '/Applications/Chop.app',
    )
  })

  it('accepts a user Applications directory', () => {
    expect(installedAppPath('/Users/sonny/Applications/Chop.app/Contents/MacOS/Chop')).toBe(
      '/Users/sonny/Applications/Chop.app',
    )
  })

  it('rejects dev executables, renamed bundles, and App Translocation', () => {
    expect(installedAppPath('/usr/local/bin/electron')).toBeNull()
    expect(installedAppPath('/Applications/Other.app/Contents/MacOS/Other')).toBeNull()
    expect(installedAppPath('/Volumes/Chop/Chop.app/Contents/MacOS/Chop')).toBeNull()
    expect(
      installedAppPath(
        '/private/var/folders/x/AppTranslocation/ABC/d/Chop.app/Contents/MacOS/Chop',
      ),
    ).toBeNull()
  })
})

describe('versionFromTag', () => {
  it('normalizes a stable release tag', () => {
    expect(versionFromTag('v1.2.3')).toBe('1.2.3')
    expect(versionFromTag('1.2.3')).toBe('1.2.3')
  })

  it('rejects tags that are not stable semantic versions', () => {
    expect(versionFromTag('nightly')).toBeNull()
    expect(versionFromTag('v1.2.3-beta.1')).toBeNull()
  })
})

describe('replacement helper', () => {
  it('waits for Chop to exit, restores the backup on failure, and relaunches', () => {
    expect(REPLACEMENT_SCRIPT).toContain('kill -0 "$pid"')
    expect(REPLACEMENT_SCRIPT).toContain('mv "$backup_app" "$target_app"')
    expect(REPLACEMENT_SCRIPT).toContain('open "$target_app"')
  })
})
