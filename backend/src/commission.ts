import { PLAN_PRICES, type Plan } from './plans';

/**
 * What an agent earns on a payment.
 *
 * The shape matters more than the numbers. A flat bounty plus a recurring share means an agent
 * earns roughly the same per farm whichever plan that farm picks, so they sell the farmer what
 * that farmer can actually sustain rather than pushing an annual plan onto someone who will
 * default in March. The recurring half is what makes them care whether the farm is still there
 * in six months.
 */

export interface CommissionInput {
  plan: Plan;
  amount: number;
  commissionRate: number;
  activationBounty: number;
  /** How many payments this farm has already made, not counting this one. */
  priorPayments: number;
}

export interface CommissionResult {
  commission: number;
  bounty: number;
  total: number;
  /** Why the bounty is or is not being paid yet, for the agent's statement. */
  bountyNote: string;
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const { plan, amount, commissionRate, activationBounty, priorPayments } = input;

  const commission = round(amount * commissionRate);

  // A trial brings in nothing, so it earns nothing. Paying a bounty on trials would just fund
  // agents activating trials for people who never intended to buy. An owner licence is not a sale
  // either, and the zero-price check below covers both.
  if (plan === 'trial' || plan === 'owner' || PLAN_PRICES[plan] === 0) {
    const what = plan === 'owner' ? 'an owner licence' : 'a free trial';
    return { commission: 0, bounty: 0, total: 0, bountyNote: `No commission on ${what}.` };
  }

  // The bounty is once per farm, on the first paid payment.
  if (priorPayments > 0) {
    return { commission, bounty: 0, total: commission, bountyNote: 'Bounty already paid for this farm.' };
  }

  // On monthly, the bounty is earned now but held until a second payment clears. It stops
  // churn-and-burn selling, and it stops an agent activating a friend's phone for one month to
  // collect a bounty worth more than the month itself.
  if (plan === 'monthly') {
    return {
      commission,
      bounty: 0,
      total: commission,
      bountyNote: 'Bounty held until this farm has paid a second time.',
    };
  }

  // Quarterly and annual are months already banked, so there is nothing to wait for.
  return {
    commission,
    bounty: activationBounty,
    total: round(commission + activationBounty),
    bountyNote: 'Bounty paid: a longer plan is already banked.',
  };
}

/**
 * The bounty a monthly farm has earned its agent once a second payment arrives.
 *
 * Called when recording payment number two, to release what the first payment held back.
 */
export function releasableBounty(input: {
  plan: Plan;
  priorPayments: number;
  firstPaymentPlan: Plan | null;
  activationBounty: number;
  bountyAlreadyPaid: boolean;
}): number {
  if (input.bountyAlreadyPaid) return 0;
  if (input.priorPayments !== 1) return 0;
  if (input.firstPaymentPlan !== 'monthly') return 0;
  if (input.plan === 'trial') return 0;
  return input.activationBounty;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
