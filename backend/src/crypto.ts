import { bytesToBase64Url } from './encoding';

/**
 * Hashing and random-token helpers.
 *
 * Everything that authenticates a caller — OTP codes, device tokens, agent keys — is stored as a
 * SHA-256 hash and never in the clear. A database dump should be useless to whoever takes it.
 */

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A URL-safe bearer token with 256 bits of entropy. */
export function randomToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * A six-digit SMS code.
 *
 * Six digits is what every Kenyan is used to typing from an M-Pesa message, and short enough to
 * read back over a noisy phone line. The brute-force exposure that creates is closed by the
 * attempt ceiling and the five-minute expiry, not by making farmers type more digits.
 */
export function randomOtp(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** Length-independent comparison, so a wrong token cannot be guessed a character at a time. */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
