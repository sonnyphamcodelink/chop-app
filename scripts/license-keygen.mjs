/**
 * Generates the Ed25519 pair licences are signed with.
 *
 *     npm run license:keygen
 *
 * Run this once. Paste the public half into `LICENSE_PUBLIC_KEY` in
 * `src/main/license/public-key.ts` and commit it. Put the private half
 * somewhere only you can reach — a password manager is ideal — because anyone
 * holding it can mint licences for your app, and losing it means every key you
 * have already sold has to be reissued against a new pair.
 */
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const privateBase64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')

console.info('Public key — paste into src/main/license/public-key.ts and commit:\n')
console.info(`  export const LICENSE_PUBLIC_KEY = '${publicBase64}'\n`)
console.info('Private key — store it safely, never commit it:\n')
console.info(`  ${privateBase64}\n`)
console.info('Sign a licence with:\n')
console.info(
  '  CHOP_LICENSE_PRIVATE_KEY=<private key> npm run license:sign -- --email you@example.com\n',
)
