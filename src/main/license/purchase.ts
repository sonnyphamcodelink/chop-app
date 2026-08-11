/**
 * Where "Buy Chop" sends people. Change this to your store's checkout link.
 *
 * Any storefront that can deliver a text key after payment works — the app only
 * ever sees the key, never the store. Sign the key with `npm run license:sign`
 * (manually, or from the store's purchase webhook) and deliver it in the
 * receipt.
 */
export const PURCHASE_URL = 'https://example.com/chop'

/** Only https links are ever handed to the system browser. */
export function isSafePurchaseUrl(url: string): boolean {
  return url.startsWith('https://')
}
