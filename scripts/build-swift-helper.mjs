import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.info('Not macOS — skipping Swift helper build.')
  process.exit(0)
}

const source = resolve('native/macos/windowlist.swift')
const outDir = resolve('resources')
const output = resolve(outDir, 'windowlist')

mkdirSync(outDir, { recursive: true })

try {
  execFileSync('swiftc', ['-O', '-o', output, source], { stdio: 'inherit' })
  console.info(`Built ${output}`)
} catch (error) {
  console.error('Failed to build the macOS window helper.')
  console.error('Xcode Command Line Tools are required: xcode-select --install')
  throw error
}
