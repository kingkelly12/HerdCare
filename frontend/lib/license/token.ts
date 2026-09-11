import nacl from 'tweetnacl';
import { asciiToBytes, base64UrlToBytes, bytesToBase64Url, bytesToUtf8, utf8ToBytes } from './encoding';

/**
 * A HerdCare activation token.
 *
 * Shaped deliberately like a tiny JWT: `HC1.<payload>.<signature>`, where the signature is Ed25519
 * over the ASCII string `HC1.<payload>`. Including the version prefix in the signed bytes means a
 * token can never be replayed against a future format that reads the same fields differently.
 *
 * The whole point is that verification needs no network. The private key signs on our side, the
 * app carries only the public key, and a farmer four hours from a mast can still activate from a
 * code sent over WhatsApp.
 */

export const TOKEN_PREFIX = 'HC1';

/**
 * Ordered shortest to longest, which is also the order they are offered in.
 *
 * There is deliberately no perpetual plan *for sale*. A one-off purchase and a sales-agent
 * network work against each other: the agent collects once and then has no reason to support that
 * farmer again, while the cost of updates and support runs on forever against a single payment.
 *
 * `owner` is the exception, and is not for sale. It is how whoever runs HerdCare holds a licence on
 * their own handset without paying themselves. It earns an agent nothing, never appears on the
 * price list, and is only ever issued deliberately.
 */
export const PLANS = ['trial', 'monthly', 'quarterly', 'annual', 'owner'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  trial: 'Free trial',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  owner: 'Owner',
};

export interface LicensePayload {
  /** Format version, so an older build refuses a token it might misread. */
  v: number;
  /** The farmer's M-Pesa number, digits only. Doubles as the account id on the server later. */
  acc: string;
  /** Farm or farmer name, purely so the app can greet them and the agent can confirm the right code. */
  farm: string;
  plan: Plan;
  /** Issued on, as a local ISO date. */
  iat: string;
  /** Last day covered, inclusive, as a local ISO date. */
  exp: string;
  /** The sales agent who activated this, or null for a direct sale. */
  agent: string | null;
}

export type VerifyResult =
  | { ok: true; payload: LicensePayload; token: string }
  | { ok: false; reason: string };

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Narrows the parsed JSON to a payload we are willing to trust, field by field. */
function readPayload(raw: unknown): LicensePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  if (candidate.v !== 1) return null;
  if (typeof candidate.acc !== 'string' || candidate.acc.length === 0) return null;
  if (typeof candidate.farm !== 'string') return null;
  if (!(PLANS as readonly unknown[]).includes(candidate.plan)) return null;
  if (!isIsoDate(candidate.iat) || !isIsoDate(candidate.exp)) return null;
  if (candidate.agent !== null && typeof candidate.agent !== 'string') return null;

  return {
    v: 1,
    acc: candidate.acc,
    farm: candidate.farm,
    plan: candidate.plan as Plan,
    iat: candidate.iat,
    exp: candidate.exp,
    agent: candidate.agent,
  };
}

/** Signs a payload. Only ever called by the issuing tool, never by the app. */
export function signLicense(payload: LicensePayload, secretKey: Uint8Array): string {
  const body = bytesToBase64Url(utf8ToBytes(JSON.stringify(payload)));
  const signingInput = `${TOKEN_PREFIX}.${body}`;
  const signature = nacl.sign.detached(asciiToBytes(signingInput), secretKey);
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/**
 * Checks a token against the public key baked into this build.
 *
 * Says nothing about whether the licence has expired — that is a question about today's date, and
 * it is answered separately in `status.ts`. This function answers only "did we really issue this".
 */
export function verifyLicense(token: string, publicKey: Uint8Array): VerifyResult {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: 'Enter an activation code to continue.' };

  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return { ok: false, reason: "That does not look like a HerdCare activation code." };
  }

  const [, body, signature] = parts;

  let signatureBytes: Uint8Array;
  let payloadBytes: Uint8Array;
  try {
    signatureBytes = base64UrlToBytes(signature);
    payloadBytes = base64UrlToBytes(body);
  } catch {
    return { ok: false, reason: 'That code looks incomplete. Check it was copied in full.' };
  }

  if (signatureBytes.length !== nacl.sign.signatureLength) {
    return { ok: false, reason: 'That code looks incomplete. Check it was copied in full.' };
  }

  const signedOk = nacl.sign.detached.verify(
    asciiToBytes(`${TOKEN_PREFIX}.${body}`),
    signatureBytes,
    publicKey,
  );
  if (!signedOk) {
    return { ok: false, reason: 'That code is not valid. Ask your HerdCare agent for a new one.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytesToUtf8(payloadBytes));
  } catch {
    return { ok: false, reason: 'That code could not be read. Ask your HerdCare agent for a new one.' };
  }

  const payload = readPayload(parsed);
  if (!payload) {
    return { ok: false, reason: 'That code was made for a newer version of HerdCare. Update the app first.' };
  }

  return { ok: true, payload, token: trimmed };
}
