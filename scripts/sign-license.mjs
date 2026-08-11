/**
 * Mints one licence key.
 *
 *     CHOP_LICENSE_PRIVATE_KEY=<base64 pkcs8> \
 *       npm run license:sign -- --email buyer@example.com --id ORDER-1043
 *
 * Options:
 *   --email    who the licence is for (required)
 *   --id       order or licence id (default: a random one)
 *   --name     licensee's display name
 *   --edition  personal | business (default: personal)
 *   --days     term in days; omit for a perpetual licence
 *
 * The key it prints is the whole product: paste it into the receipt. Run this
 * by hand for early sales, or call it from your store's purchase webhook once
 * the volume justifies it.
 */
import { createPrivateKey, randomUUID, sign } from 'node:crypto'

const EDITIONS = ['personal', 'business']
const DAY_MS = 24 * 60 * 60 * 1000

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (!flag.startsWith('--')) continue
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      fail(`${flag} needs a value.`)
    }
    args[flag.slice(2)] = value
    i += 1
  }
  return args
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const args = parseArgs(process.argv.slice(2))

const privateBase64 = process.env.CHOP_LICENSE_PRIVATE_KEY?.trim()
if (!privateBase64) {
  fail('Set CHOP_LICENSE_PRIVATE_KEY to the private key from `npm run license:keygen`.')
}

const email = args.email?.trim()
if (!email) fail('--email is required.')

const edition = args.edition ?? 'personal'
if (!EDITIONS.includes(edition)) fail(`--edition must be one of: ${EDITIONS.join(', ')}`)

let expiresAt = null
if (args.days !== undefined) {
  const days = Number(args.days)
  if (!Number.isFinite(days) || days <= 0) fail('--days must be a positive number.')
  expiresAt = new Date(Date.now() + days * DAY_MS).toISOString()
}

const claims = {
  id: args.id?.trim() || randomUUID(),
  email,
  name: args.name?.trim() || null,
  edition,
  issuedAt: new Date().toISOString(),
  expiresAt,
}

let privateKey
try {
  privateKey = createPrivateKey({
    key: Buffer.from(privateBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
} catch {
  fail('CHOP_LICENSE_PRIVATE_KEY is not a usable Ed25519 private key.')
}

// The signature covers the encoded claims segment exactly as it ships, so the
// app can verify the bytes it received without re-serialising anything.
const signed = toBase64Url(Buffer.from(JSON.stringify(claims), 'utf8'))
const signature = toBase64Url(sign(null, Buffer.from(signed, 'utf8'), privateKey))

console.info(`Licence for ${claims.email}`)
console.info(`  id       ${claims.id}`)
console.info(`  edition  ${claims.edition}`)
console.info(`  expires  ${claims.expiresAt ?? 'never'}\n`)
console.info(`CHOP1.${signed}.${signature}`)
