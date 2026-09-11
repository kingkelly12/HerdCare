import type { PaymentProvider, ProviderCallback, PushArgs, PushResult } from './types';

/**
 * Safaricom Daraja: talking to M-Pesa directly, with your own paybill or till.
 *
 * The destination once volume justifies the paperwork. Lower cost per payment than an aggregator,
 * and no third party between you and the money, in exchange for a registered business and a
 * Safaricom onboarding process.
 *
 * The security problem worth stating plainly: **Daraja callbacks are not authenticated.** There is
 * no signature and no shared secret in the body. All this provider can check is the unguessable
 * segment in the callback path; everything else rests on the reference matching a pending row we
 * created, which is enforced above this file.
 */

export interface DarajaConfig {
  consumerKey?: string;
  consumerSecret?: string;
  /** Paybill or till number. */
  shortCode?: string;
  /**
   * 'paybill' or 'till'. Daraja needs a different transaction type for each, and sending the
   * wrong one fails with an unhelpful error, so it is configuration rather than a guess.
   */
  shortCodeType?: string;
  /** The Lipa na M-Pesa Online passkey from the Daraja portal. */
  passKey?: string;
  /** 'sandbox' or 'production'. */
  environment?: string;
}

function baseUrl(config: DarajaConfig): string {
  return config.environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

/** Daraja wants `yyyyMMddHHmmss` in Nairobi time, and rejects anything more than a few minutes off. */
export function darajaTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // 'en-GB' renders midnight as 24; Daraja expects 00.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}${get('month')}${get('day')}${hour}${get('minute')}${get('second')}`;
}

/** The `Password` field: base64 of shortcode + passkey + timestamp. */
export function stkPassword(shortCode: string, passKey: string, timestamp: string): string {
  return btoa(`${shortCode}${passKey}${timestamp}`);
}

async function accessToken(config: DarajaConfig): Promise<string> {
  const credentials = btoa(`${config.consumerKey}:${config.consumerSecret}`);
  const response = await fetch(`${baseUrl(config)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) throw new Error(`Daraja rejected our credentials (${response.status}).`);

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Daraja returned no access token.');
  return data.access_token;
}

export function createDaraja(config: DarajaConfig): PaymentProvider {
  return {
    name: 'daraja',

    isConfigured() {
      return Boolean(config.consumerKey && config.consumerSecret && config.shortCode && config.passKey);
    },

    async push(args: PushArgs): Promise<PushResult> {
      const timestamp = darajaTimestamp();
      const token = await accessToken(config);

      const response = await fetch(`${baseUrl(config)}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BusinessShortCode: config.shortCode,
          Password: stkPassword(config.shortCode!, config.passKey!, timestamp),
          Timestamp: timestamp,
          // Buy Goods (a till) and Pay Bill are different products at Safaricom's end.
          TransactionType:
            config.shortCodeType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
          // Daraja rejects decimals. Subscriptions are whole shillings anyway.
          Amount: Math.round(args.amount),
          PartyA: args.phone,
          PartyB: config.shortCode,
          PhoneNumber: args.phone,
          CallBackURL: args.callbackUrl,
          AccountReference: args.reference.slice(0, 12),
          TransactionDesc: args.description.slice(0, 13),
        }),
      });

      const data = (await response.json()) as Record<string, unknown>;

      if (!response.ok || data.ResponseCode !== '0') {
        const message =
          typeof data.errorMessage === 'string' ? data.errorMessage : 'Could not start the payment.';
        throw new Error(message);
      }

      return {
        reference: String(data.CheckoutRequestID ?? ''),
        providerRef: String(data.MerchantRequestID ?? ''),
        customerMessage: String(data.CustomerMessage ?? 'Check your phone to enter your M-Pesa PIN.'),
      };
    },

    parseCallback(body: unknown): ProviderCallback | null {
      const callback = (body as any)?.Body?.stkCallback;
      if (!callback || typeof callback !== 'object') return null;

      const reference = callback.CheckoutRequestID;
      if (typeof reference !== 'string' || !reference) return null;

      const resultCode = Number(callback.ResultCode);
      if (!Number.isFinite(resultCode)) return null;

      const items: any[] = callback.CallbackMetadata?.Item ?? [];
      const item = (name: string) => items.find((i) => i?.Name === name)?.Value ?? null;

      const receipt = item('MpesaReceiptNumber');
      const amount = item('Amount');
      const phone = item('PhoneNumber');

      return {
        reference,
        succeeded: resultCode === 0,
        // Daraja only calls back once, with an outcome. There is no in-flight callback.
        pending: false,
        detail: typeof callback.ResultDesc === 'string' ? callback.ResultDesc : '',
        receipt: receipt == null ? null : String(receipt),
        amount: amount == null ? null : Number(amount),
        payer: phone == null ? null : String(phone),
      };
    },

    authenticateCallback(_body: unknown, pathSecret: string): boolean {
      // Daraja signs nothing, so the unguessable path segment is the whole of it. The caller has
      // already compared that; reaching here means it matched.
      return Boolean(pathSecret);
    },
  };
}
