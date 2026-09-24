import { GRACE_DAYS } from './subscription';
import { daysBetweenYmd } from './plans';

/**
 * An agent's farmers, from the day they are introduced to the day they stop paying.
 *
 * Pure, so the stage rules can be tested without a database. The three inputs are all scoped to
 * one agent before they reach here; that scoping is what stops an agent seeing another agent's
 * farmers, so it is done in the SQL, not trusted to this function.
 */

/** Where a farmer is, in the order an agent should care about them. */
export type Stage =
  /** Paid up, but the next payment is due within a week or is a few days late. Worth a call. */
  | 'renewal-due'
  /** Free trial ends within a month. The conversation that earns the bounty. */
  | 'trial-ending'
  /** Free trial with more than a month left. Nothing to do but help them use it. */
  | 'trial'
  /** Paying, and not due for a while. Earning without any work. */
  | 'paying'
  /** Trial ran out and they never paid. */
  | 'trial-ended'
  /** Used to pay, and stopped. */
  | 'lapsed';

/** How many days before a trial ends it counts as ending. */
export const TRIAL_ENDING_DAYS = 30;
/** How many days before a paid period ends it counts as due. */
export const RENEWAL_DUE_DAYS = 7;

export interface ReferralInput {
  phone: string;
  name: string;
  trial_ends_at: string;
  created_at: string;
}

export interface FarmInput {
  phone: string;
  name: string;
  plan: string;
  expires_at: string;
  activated_at: string;
}

export interface PaymentInput {
  phone: string;
  name: string;
  plan: string;
  amount: number;
  earned: number;
  paid_at: string;
}

export interface PipelineFarmer {
  phone: string;
  name: string;
  /** When the agent first had them: the referral, or failing that the farm's activation. */
  joinedAt: string;
  stage: Stage;
  /** Days until the date that matters for this stage. Negative once it has passed. */
  daysLeft: number | null;
  trialEndsOn: string | null;
  paidUntil: string | null;
  plan: string | null;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
  /** Commission and bounty this agent has been credited on this farmer, settled or not. */
  earned: number;
}

export type PipelineEventKind = 'joined' | 'first-payment' | 'renewed';

export interface PipelineEvent {
  kind: PipelineEventKind;
  at: string;
  phone: string;
  name: string;
  plan?: string;
  amount?: number;
  earned?: number;
}

export interface Pipeline {
  farmers: PipelineFarmer[];
  events: PipelineEvent[];
}

const STAGE_ORDER: Stage[] = ['renewal-due', 'trial-ending', 'trial', 'paying', 'trial-ended', 'lapsed'];

export function buildPipeline(
  referrals: ReferralInput[],
  farms: FarmInput[],
  payments: PaymentInput[],
  today: string,
  eventLimit = 50,
): Pipeline {
  const referralByPhone = new Map(referrals.map((row) => [row.phone, row]));
  const farmByPhone = new Map(farms.map((row) => [row.phone, row]));
  const paymentsByPhone = new Map<string, PaymentInput[]>();
  for (const payment of [...payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at))) {
    paymentsByPhone.set(payment.phone, [...(paymentsByPhone.get(payment.phone) ?? []), payment]);
  }

  const phones = new Set([...referralByPhone.keys(), ...farmByPhone.keys()]);
  const farmers: PipelineFarmer[] = [];

  for (const phone of phones) {
    const referral = referralByPhone.get(phone);
    const farm = farmByPhone.get(phone);
    const paid = paymentsByPhone.get(phone) ?? [];

    const name = farm?.name || referral?.name || '';
    const joinedAt = referral?.created_at ?? farm?.activated_at ?? today;
    const earned = round(paid.reduce((sum, payment) => sum + payment.earned, 0));
    const firstPaidAt = paid[0]?.paid_at ?? null;
    const lastPaidAt = paid[paid.length - 1]?.paid_at ?? null;

    // A farm that has paid, or one on a paid plan, is judged by what it has paid for.
    const isPaying = farm && (paid.length > 0 || farm.plan !== 'trial');

    let stage: Stage;
    let daysLeft: number | null = null;
    let trialEndsOn: string | null = referral?.trial_ends_at ?? null;

    if (isPaying && farm) {
      daysLeft = daysBetweenYmd(today, farm.expires_at);
      stage = daysLeft > RENEWAL_DUE_DAYS ? 'paying' : daysLeft >= -GRACE_DAYS ? 'renewal-due' : 'lapsed';
    } else {
      // A trial the agent granted by hand lives on the farm row rather than a referral.
      trialEndsOn = trialEndsOn ?? farm?.expires_at ?? null;
      if (trialEndsOn) {
        daysLeft = daysBetweenYmd(today, trialEndsOn);
        stage = daysLeft < 0 ? 'trial-ended' : daysLeft <= TRIAL_ENDING_DAYS ? 'trial-ending' : 'trial';
      } else {
        stage = 'trial';
      }
    }

    farmers.push({
      phone,
      name,
      joinedAt,
      stage,
      daysLeft,
      trialEndsOn,
      paidUntil: isPaying && farm ? farm.expires_at : null,
      plan: isPaying && farm ? farm.plan : null,
      firstPaidAt,
      lastPaidAt,
      earned,
    });
  }

  // Most urgent stage first; within a stage, whoever's date comes soonest.
  farmers.sort((a, b) => {
    const byStage = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
    if (byStage !== 0) return byStage;
    return (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER);
  });

  const events: PipelineEvent[] = [];
  for (const referral of referrals) {
    events.push({ kind: 'joined', at: referral.created_at, phone: referral.phone, name: referral.name });
  }
  for (const [phone, list] of paymentsByPhone) {
    list.forEach((payment, index) => {
      events.push({
        kind: index === 0 ? 'first-payment' : 'renewed',
        at: payment.paid_at,
        phone,
        name: farmByPhone.get(phone)?.name || payment.name || referralByPhone.get(phone)?.name || '',
        plan: payment.plan,
        amount: payment.amount,
        earned: round(payment.earned),
      });
    });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  return { farmers, events: events.slice(0, eventLimit) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
