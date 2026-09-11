import type { Plan } from './token';

/**
 * What HerdCare costs. The one place to change a price.
 *
 * These are display only — a token carries the plan and the dates, never an amount, so changing a
 * price here can never alter what a farmer has already bought. Money actually changes hands over
 * M-Pesa between the farmer and their agent, which is why nothing here charges anybody.
 */

export const PRICE_CURRENCY = 'KES';

/**
 * Months covered by each plan.
 *
 * The single source of truth: the issuing tool imports this to work out an expiry date, and the
 * price list below divides by it. Two copies of this that disagreed would put a farmer's expiry
 * and the price they were quoted out of step.
 */
export const PLAN_MONTHS: Record<Plan, number> = {
  trial: 1,
  monthly: 1,
  quarterly: 3,
  annual: 12,
  // A century. Not literally forever, but long enough that nobody alive renews it, and it still
  // goes through exactly the same signature and expiry checks as every other licence.
  owner: 1200,
};

export const PLAN_PRICES: Record<Plan, number> = {
  trial: 0,
  owner: 0,
  monthly: 1_000,
  quarterly: 2_800,
  annual: 10_000,
};

/**
 * The plans a farmer chooses between, cheapest commitment first.
 *
 * The trial and the owner licence are absent deliberately. The trial is something an agent offers
 * rather than something a farmer picks off a price list, and showing it beside the paid plans only
 * invites "why would I pay, then". The owner licence is not for sale at all.
 */
export const PURCHASABLE_PLANS: Plan[] = ['monthly', 'quarterly', 'annual'];

/** The plan an agent leads with, highlighted on the price list. */
export const DEFAULT_PLAN: Plan = 'quarterly';

/** What a plan works out at per month, so the saving on a longer plan is visible rather than implied. */
export function pricePerMonth(plan: Plan): number {
  return Math.round(PLAN_PRICES[plan] / PLAN_MONTHS[plan]);
}

/** "3 months", "1 month", "12 months" — used to label a price row. */
export function planDurationLabel(plan: Plan): string {
  const months = PLAN_MONTHS[plan];
  return months === 1 ? '1 month' : `${months} months`;
}
