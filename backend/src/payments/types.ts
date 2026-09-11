/**
 * One shape for every way money can reach us.
 *
 * HerdCare starts on an aggregator because that needs no paybill application, and is expected to
 * move to its own Safaricom shortcode once volume justifies it. Both are just ways of asking a
 * farmer's phone for a PIN, so the difference lives behind this interface and nothing above it —
 * the pending-payment table, the fraud checks, the commission ledger — has to know which is in use.
 */

export interface PushArgs {
  /** Digits only, 2547XXXXXXXX. */
  phone: string;
  amount: number;
  /** Our own id for this attempt, echoed back by the provider so we can match the callback. */
  reference: string;
  callbackUrl: string;
  description: string;
}

export interface PushResult {
  /** The provider's id for this attempt. Stored as `pending_payments.checkout_request_id`. */
  reference: string;
  /** Any secondary id the provider issues, kept for support conversations. */
  providerRef: string;
  /** What to tell the farmer while their phone rings. */
  customerMessage: string;
}

export interface ProviderCallback {
  /** Matches the `reference` a `PushResult` returned. */
  reference: string;
  /** True only when money actually moved. */
  succeeded: boolean;
  /** Still in flight. Providers report progress as well as outcomes. */
  pending: boolean;
  detail: string;
  /**
   * A unique id for the money itself, used for idempotency.
   *
   * Safaricom gives an M-Pesa receipt. An aggregator may only give its own invoice id, which is
   * equally unique and serves the same purpose: one payment must never be credited twice.
   */
  receipt: string | null;
  amount: number | null;
  /** The payer, as the provider reports them. Not always a phone number. */
  payer: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  push(args: PushArgs): Promise<PushResult>;
  /** Reads the provider's callback body, or null if it is not one of theirs. */
  parseCallback(body: unknown): ProviderCallback | null;
  /**
   * Whether this callback really came from the provider.
   *
   * Separate from parsing on purpose. Every provider authenticates differently — a secret in the
   * path, a shared challenge in the body, an HMAC header — and none of them may be skipped.
   */
  authenticateCallback(body: unknown, pathSecret: string): boolean;
}

/**
 * Whether a callback may be acted on, given the pending row it claims to answer.
 *
 * Provider-agnostic and pure, so the rules are asserted in tests rather than discovered in
 * production. The amount check is the one that matters: without it, a forged callback naming a
 * real reference could claim one shilling bought a year.
 */
export function callbackMatchesPending(
  callback: ProviderCallback,
  pending: { phone: string; amount: number; status: string },
): { ok: true } | { ok: false; reason: string } {
  if (pending.status !== 'pending') return { ok: false, reason: 'This payment was already settled.' };
  if (!callback.succeeded) return { ok: false, reason: callback.detail || 'The payment did not go through.' };
  if (!callback.receipt) return { ok: false, reason: 'The callback reported success with no receipt.' };
  if (callback.amount == null || Math.round(callback.amount) < Math.round(pending.amount)) {
    return { ok: false, reason: 'The amount paid is less than the amount requested.' };
  }
  // Compare the last nine digits, which is the part of a Kenyan number that does not vary with
  // how it was written. Providers that report an email rather than a phone skip this check.
  const payerDigits = (callback.payer ?? '').replace(/[^0-9]/g, '');
  if (payerDigits.length >= 9 && !payerDigits.endsWith(pending.phone.slice(-9))) {
    return { ok: false, reason: 'The payment came from a different number.' };
  }
  return { ok: true };
}
