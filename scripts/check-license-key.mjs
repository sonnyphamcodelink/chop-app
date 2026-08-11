/**
 * Refuses to package a build that has no licence public key.
 *
 * Verification fails closed, so shipping without a key would reject every
 * licence ever sold — including the ones people paid for. Better to fail here,
 * where it costs a minute, than in a customer's hands.
 */
import { createPublicKey } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('src/main/license/public-key.ts')
const contents = readFileSync(source, 'utf8')

const match = /export const LICENSE_PUBLIC_KEY = '([^']*)'/.exec(contents)
if (!match) {
  console.error(`Could not find LICENSE_PUBLIC_KEY in ${source}.`)
  process.exit(1)
}

const key = match[1].trim()
if (!key) {
  console.error('No licence public key is set, so no licence would ever verify.\n')
  console.error('  npm run license:keygen\n')
  console.error(`Then paste the public half into ${source}.`)
  process.exit(1)
}

try {
  const body = key.match(/.{1,64}/g).join('\n')
  const parsed = createPublicKey({
    key: `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`,
    format: 'pem',
  })
  if (parsed.asymmetricKeyType !== 'ed25519') {
    console.error(`LICENSE_PUBLIC_KEY is a ${parsed.asymmetricKeyType} key; Ed25519 is required.`)
    process.exit(1)
  }
} catch {
  console.error('LICENSE_PUBLIC_KEY is not a usable Ed25519 public key.')
  process.exit(1)
}

console.info('Licence public key looks good.')
