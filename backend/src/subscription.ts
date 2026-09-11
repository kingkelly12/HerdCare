import type { AgentRow, Env, FarmRow } from './types';
import { calculateCommission, releasableBounty } from './commission';
import { signLicense, type LicensePayload } from './license';
import { PLAN_MONTHS, PLAN_PRICES, addMonthsYmd, daysBetweenYmd, todayInNairobi, type Plan } from './plans';

/**
 * Extending a subscription and recording what it earned.
 *
 * One path, used by every way money can arrive: an agent recording a payment, an M-Pesa callback,
 * or an admin fixing something by hand. If these diverged, the commission ledger would quietly
 * stop adding up depending on how a farmer happened to pay.
 */

/** Matches GRACE_DAYS in the app. The server and the phone must agree on when a licence is dead. */
export const GRACE_DAYS = 7;

export function describeFarm(farm: FarmRow, today = todayInNairobi()) {
  const daysLeft = daysBetweenYmd(today, farm.expires_at);
  return {
    phone: farm.phone,
    name: farm.name,
    plan: farm.plan,
    expiresAt: farm.expires_at,
    agent: farm.agent_code,
    daysLeft,
    state: daysLeft >= 0 ? 'active' : daysLeft >= -GRACE_DAYS ? 'grace' : 'expired',
  };
}

export async function issueToken(env: Env, farm: FarmRow, reason: string): Promise<string> {
  const payload: LicensePayload = {
    v: 1,
    acc: farm.phone,
    farm: farm.name,
    plan: farm.plan as Plan,
    iat: todayInNairobi(),
    exp: farm.expires_at,
    agent: farm.agent_code,
  };

  const token = await signLicense(payload, env.LICENSE_SIGNING_SEED);

  await env.DB.prepare(
    `INSERT INTO issued_licenses (id, farm_id, token, plan, expires_at, reason, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), farm.id, token, farm.plan, farm.expires_at, reason, new Date().toISOString())
    .run();

  return token;
}

/**
 * Where a renewal starts counting from.
 *
 * The later of today and the current expiry, so paying early never costs a farmer days they had
 * already bought, while a farm that lapsed three months ago is not credited for the months it was
 * gone. Pure, so the rule can be asserted rather than inferred.
 */
export function renewalStart(today: string, currentExpiry: string | null): string {
  if (!currentExpiry) return today;
  return daysBetweenYmd(today, currentExpiry) > 0 ? currentExpiry : today;
}

export interface ApplyPaymentArgs {
  farm: FarmRow;
  plan: Plan;
  amount?: number;
  mpesaRef?: string | null;
  /** Re-sign the current licence without extending it. Used when the app polls a settled payment. */
  reissueOnly?: boolean;
  reason?: string;
}

export interface ApplyPaymentResult {
  farm: FarmRow;
  token: string;
  duplicate: boolean;
  commission: number;
  bounty: number;
  note: string;
}

export async function applyPayment(env: Env, args: ApplyPaymentArgs): Promise<ApplyPaymentResult> {
  const { farm, plan, reissueOnly = false } = args;

  if (reissueOnly) {
    const token = await issueToken(env, farm, args.reason ?? 'reissue');
    return { farm, token, duplicate: false, commission: 0, bounty: 0, note: 'Re-issued without extending.' };
  }

  const amount = args.amount ?? PLAN_PRICES[plan];
  const mpesaRef = args.mpesaRef ?? null;

  // A repeated M-Pesa reference means a replayed callback or a double submit. Earning a second
  // commission, or granting a second month, on one payment is exactly the bug that makes both the
  // ledger and the licence untrustworthy.
  if (mpesaRef) {
    const seen = await env.DB.prepare('SELECT id FROM payments WHERE mpesa_ref = ?').bind(mpesaRef).first();
    if (seen) {
      const token = await issueToken(env, farm, 'duplicate');
      return {
        farm,
        token,
        duplicate: true,
        commission: 0,
        bounty: 0,
        note: 'This M-Pesa reference was already recorded.',
      };
    }
  }

  const today = todayInNairobi();
  const from = renewalStart(today, farm.expires_at);
  const expiresAt = addMonthsYmd(from, PLAN_MONTHS[plan]);

  await env.DB.prepare('UPDATE farms SET plan = ?, expires_at = ?, updated_at = ? WHERE id = ?')
    .bind(plan, expiresAt, new Date().toISOString(), farm.id)
    .run();

  const updated: FarmRow = { ...farm, plan, expires_at: expiresAt };

  const prior = await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE farm_id = ? AND plan != 'trial'")
    .bind(farm.id)
    .first<{ n: number }>();
  const priorPayments = prior?.n ?? 0;

  const agent = farm.agent_code
    ? await env.DB.prepare('SELECT * FROM agents WHERE code = ?').bind(farm.agent_code).first<AgentRow>()
    : null;

  const earned = calculateCommission({
    plan,
    amount,
    commissionRate: agent?.commission_rate ?? 0,
    activationBounty: agent?.activation_bounty ?? 0,
    priorPayments,
  });

  // Release a monthly farm's held-back bounty now that a second payment has arrived.
  let bounty = earned.bounty;
  if (agent && priorPayments === 1) {
    const first = await env.DB.prepare(
      "SELECT plan, bounty FROM payments WHERE farm_id = ? AND plan != 'trial' ORDER BY created_at LIMIT 1",
    )
      .bind(farm.id)
      .first<{ plan: string; bounty: number }>();

    bounty += releasableBounty({
      plan,
      priorPayments,
      firstPaymentPlan: (first?.plan as Plan) ?? null,
      activationBounty: agent.activation_bounty,
      bountyAlreadyPaid: (first?.bounty ?? 0) > 0,
    });
  }

  await env.DB.prepare(
    `INSERT INTO payments (id, farm_id, amount, plan, mpesa_ref, paid_at, period_start, period_end,
                           agent_code, commission, bounty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      farm.id,
      amount,
      plan,
      mpesaRef,
      new Date().toISOString(),
      from,
      expiresAt,
      farm.agent_code,
      earned.commission,
      bounty,
      new Date().toISOString(),
    )
    .run();

  const token = await issueToken(env, updated, args.reason ?? 'payment');

  return { farm: updated, token, duplicate: false, commission: earned.commission, bounty, note: earned.bountyNote };
}
