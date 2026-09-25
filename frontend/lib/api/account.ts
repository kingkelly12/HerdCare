import { apiRequest, type ApiResult } from './client';
import { saveCloudAccount } from '@/db/cloudAccount';
import { activateLicense } from '@/db/license';

/**
 * Signing in, which in this app means proving you still hold your M-Pesa number.
 *
 * There is no password. The number is the identity: it is already on every licence, it is how
 * money arrives, and it survives a lost handset because Safaricom will reissue the SIM. A farmer
 * who has typed an M-Pesa confirmation code has already performed this flow.
 */

export interface RequestCodeResponse {
  sent: boolean;
  expiresInMinutes: number;
  message: string;
  /** Only ever present against a development server with no SMS account. */
  devCode?: string;
}

export function requestSignInCode(phone: string): Promise<ApiResult<RequestCodeResponse>> {
  return apiRequest<RequestCodeResponse>('/auth/request', { method: 'POST', body: { phone } });
}

export interface VerifyResponse {
  /** Null for a farmer who has never paid: they have records to bring back, but no subscription. */
  deviceToken: string | null;
  /** The farm's activation code, sent with the sign-in so a new phone unlocks in one round trip. */
  token: string | null;
  farm: { phone: string; name: string; plan: string; expiresAt: string; today: string } | null;
  /** The older, signed-in backup, kept for farmers who used it before automatic backup. */
  backup: { available: boolean; sizeBytes?: number; records?: number; savedAt?: string };
  /** The automatic backup found under this number, now handed to this phone. */
  install?: { id: string; key: string; sizeBytes: number; records: number; savedAt: string } | null;
}

/**
 * Exchanges the SMS code for everything a replacement phone needs.
 *
 * The device token is stored, and the farm's licence is applied straight away, so a farmer who has
 * just signed in on a new handset can log an event before deciding whether to restore anything.
 */
export async function verifySignInCode(
  phone: string,
  code: string,
): Promise<ApiResult<VerifyResponse>> {
  const result = await apiRequest<VerifyResponse>('/auth/verify', {
    method: 'POST',
    body: { phone, code },
  });

  if (!result.ok) return result;

  if (result.data.farm && result.data.deviceToken) {
    await saveCloudAccount(result.data.farm.phone, result.data.deviceToken);
  }

  // The licence arrives with the sign-in, so the app unlocks without a second round trip. A
  // failure here is not fatal: the farmer is signed in and can still restore their records, and
  // the licence will arrive on the next refresh or from a code their agent sends.
  if (result.data.token) {
    const applied = await activateLicense(result.data.token);
    if (!applied.ok) console.warn('Signed in but the licence was rejected', applied.reason);
  }

  return result;
}
