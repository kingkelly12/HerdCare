import { asciiToBytes, base64UrlToBytes, bytesToBase64Url, bytesToUtf8, utf8ToBytes } from './encoding';
import type { Plan } from './plans';
import { isPlan } from './plans';

/**
 * Signing and checking HerdCare activation codes.
 *
 * The format is fixed by what the app already verifies offline: `HC1.<payload>.<signature>`, with
 * the signature being Ed25519 over the ASCII string `HC1.<payload>`. Phase zero signed these from
 * a laptop with tweetnacl; this file signs them in the Worker with WebCrypto. Ed25519 signing is
 * deterministic, so the same key produces byte-identical signatures either way — every code
 * already in a farmer's hands stays valid, and the app needs no change at all.
 */

export const TOKEN_PREFIX = 'HC1';

export interface LicensePayload {
  v: number;
  /** The farmer's M-Pesa number, digits only. */
  acc: string;
  farm: string;
  plan: Plan;
  /** Issued on, local ISO date. */
  iat: string;
  /** Last day covered, inclusive, local ISO date. */
  exp: string;
  agent: string | null;
}

/** Raw Ed25519 seeds are 32 bytes; PKCS8 wants them inside this fixed DER header. */
const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

async function importSigningKey(seedBase64Url: string): Promise<CryptoKey> {
  const seed = base64UrlToBytes(seedBase64Url.trim());
  if (seed.length !== 32) {
    throw new Error(`LICENSE_SIGNING_SEED must be a 32-byte base64url seed, got ${seed.length} bytes.`);
  }

  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_ED25519_PREFIX, 0);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);

  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

export async function signLicense(payload: LicensePayload, seedBase64Url: string): Promise<string> {
  const body = bytesToBase64Url(utf8ToBytes(JSON.stringify(payload)));
  const signingInput = `${TOKEN_PREFIX}.${body}`;
  const key = await importSigningKey(seedBase64Url);
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, asciiToBytes(signingInput)));
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/**
 * Reads a token's payload without checking the signature.
 *
 * Used only by the refresh endpoint, to learn which farm is asking. The answer is then looked up
 * in the database, which is the actual authority — so a forged token gets a lookup that fails
 * rather than a licence. Never trust these fields for anything else.
 */
export function readUnverifiedPayload(token: string): LicensePayload | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;

  try {
    const raw = JSON.parse(bytesToUtf8(base64UrlToBytes(parts[1]))) as Record<string, unknown>;
    if (raw.v !== 1) return null;
    if (typeof raw.acc !== 'string' || raw.acc.length === 0) return null;
    if (typeof raw.farm !== 'string') return null;
    if (!isPlan(raw.plan)) return null;
    if (typeof raw.iat !== 'string' || typeof raw.exp !== 'string') return null;
    if (raw.agent !== null && typeof raw.agent !== 'string') return null;

    return { v: 1, acc: raw.acc, farm: raw.farm, plan: raw.plan, iat: raw.iat, exp: raw.exp, agent: raw.agent };
  } catch {
    return null;
  }
}

/**
 * Kenyan numbers get written every which way. One shape stored means an M-Pesa notification can be
 * matched to a farm without a human squinting at it.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}
