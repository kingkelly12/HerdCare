/** Shared row shapes and the Worker's bindings. */

export interface Env {
  DB: D1Database;

  /** 32-byte Ed25519 seed, base64url. Signs activation codes. A Worker secret. */
  LICENSE_SIGNING_SEED: string;
  /** Bearer token guarding admin endpoints. A Worker secret. */
  ADMIN_TOKEN: string;

  /** Unguessable segment in the M-Pesa callback path. A Worker secret. */
  MPESA_CALLBACK_SECRET?: string;
  /** Public base URL of this Worker, e.g. https://herdcare-backend.you.workers.dev */
  PUBLIC_BASE_URL?: string;

  /** Safaricom Daraja, against your own paybill or till. */
  MPESA_CONSUMER_KEY?: string;
  MPESA_CONSUMER_SECRET?: string;
  MPESA_SHORTCODE?: string;
  /** 'paybill' (default) or 'till'. Buy Goods needs a different Daraja transaction type. */
  MPESA_SHORTCODE_TYPE?: string;
  MPESA_PASSKEY?: string;
  /** 'sandbox' or 'production'. */
  MPESA_ENVIRONMENT?: string;

  SMS_USERNAME?: string;
  SMS_API_KEY?: string;
  SMS_SENDER_ID?: string;

  /** 'true' returns OTP codes in the response when SMS is unconfigured. Never in production. */
  ALLOW_DEV_OTP?: string;
}

export interface FarmRow {
  id: string;
  phone: string;
  name: string;
  agent_code: string | null;
  plan: string;
  expires_at: string;
  activated_at: string;
  updated_at: string;
}

export interface AgentRow {
  code: string;
  name: string;
  phone: string | null;
  api_key_hash: string | null;
  commission_rate: number;
  activation_bounty: number;
  active: number;
}

export interface PendingPaymentRow {
  id: string;
  checkout_request_id: string;
  merchant_request_id: string | null;
  farm_id: string | null;
  phone: string;
  plan: string;
  amount: number;
  status: string;
  result_code: number | null;
  result_desc: string | null;
  mpesa_ref: string | null;
  created_at: string;
  settled_at: string | null;
}
