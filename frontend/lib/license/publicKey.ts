import { base64UrlToBytes } from './encoding';

/**
 * The public half of the licence signing key, baked into the build.
 *
 * Written here by `npm run license -- keygen` — do not edit by hand. The private half never leaves
 * the issuing machine (and later, a Cloudflare Worker secret), so a copy of the APK gives away
 * nothing but the ability to *check* a licence, which is exactly what we want it to do.
 *
 * Changing this key invalidates every token already in the field, so treat it as permanent once
 * the first farmer has been activated.
 */
const PUBLIC_KEY_BASE64URL = 'WoCIOqeuiOdABwAC24Lo6e_ig39PGjqUzXv4lbzTIQM';

export const LICENSE_PUBLIC_KEY: Uint8Array =
  PUBLIC_KEY_BASE64URL.length > 0 ? base64UrlToBytes(PUBLIC_KEY_BASE64URL) : new Uint8Array(32);

/** False until a key has been generated, so the app can say something useful instead of failing. */
export const LICENSE_KEY_CONFIGURED = PUBLIC_KEY_BASE64URL.length > 0;
