import { apiRequest, type ApiResult } from './client';
import { activateLicense } from '@/db/license';
import type { Plan } from '@/lib/license/token';

/**
 * Paying for a subscription from inside the app.
 *
 * The farmer picks a plan, their own phone asks for their M-Pesa PIN, and the app unlocks. This is
 * the only screen in HerdCare that needs a network, and that is unavoidable: paying Safaricom
 * cannot happen offline.
 */

export interface StartPaymentResponse {
  checkoutId: string;
  message: string;
  amount: number;
  currency: string;
}

export function startPayment(
  phone: string,
  plan: Plan,
  agent?: string | null,
): Promise<ApiResult<StartPaymentResponse>> {
  return apiRequest<StartPaymentResponse>('/pay', {
    method: 'POST',
    body: { phone, plan, ...(agent ? { agent } : {}) },
  });
}

export interface PaymentStatusResponse {
  status: 'pending' | 'paid' | 'failed' | 'rejected' | 'cancelled';
  detail?: string;
  receipt?: string;
  token?: string;
  farm?: { phone: string; plan: string; expiresAt: string };
}

export function checkPayment(checkoutId: string): Promise<ApiResult<PaymentStatusResponse>> {
  return apiRequest<PaymentStatusResponse>(`/pay/${encodeURIComponent(checkoutId)}`);
}

/** How long to keep asking before giving up on the farmer entering their PIN. */
const POLL_TIMEOUT_MS = 90_000;
const POLL_EVERY_MS = 3_000;

export type PollOutcome =
  | { outcome: 'paid'; receipt?: string; expiresAt?: string }
  | { outcome: 'failed'; reason: string }
  | { outcome: 'timeout' };

/**
 * Waits for the farmer to enter their PIN, then activates the code that comes back.
 *
 * A timeout is not a failure: Safaricom may still deliver the callback after we stop asking, so
 * the wording the caller shows says to check again shortly rather than that the payment was lost.
 */
export async function waitForPayment(
  checkoutId: string,
  onTick?: (secondsWaited: number) => void,
): Promise<PollOutcome> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
    onTick?.(Math.round((Date.now() - startedAt) / 1000));

    const result = await checkPayment(checkoutId);

    // A blip in coverage mid-wait should not end the wait; the PIN prompt is still on their phone.
    if (!result.ok) continue;

    if (result.data.status === 'paid') {
      if (result.data.token) await activateLicense(result.data.token);
      return { outcome: 'paid', receipt: result.data.receipt, expiresAt: result.data.farm?.expiresAt };
    }

    if (result.data.status !== 'pending') {
      return { outcome: 'failed', reason: result.data.detail ?? 'The payment did not go through.' };
    }
  }

  return { outcome: 'timeout' };
}
