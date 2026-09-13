import { PLAN_MONTHS, PLAN_PRICES } from '@/lib/license/pricing';
import type { Plan } from '@/lib/license/token';

/**
 * What an agent earns, computed rather than written down.
 *
 * Every figure an agent is ever shown comes from here, derived from the same prices the app
 * charges. Commission numbers typed into screen copy drift the moment a price changes, and an
 * agent who finds the app quoting a number their M-Pesa disagrees with stops trusting all of them.
 *
 * Mirrors backend/src/commission.ts. The rules that matter:
 *   - commission is a share of every payment, for as long as the farm keeps paying;
 *   - the bounty is once per farm, on its first paid subscription;
 *   - on monthly it is held back until that farm has paid twice, so it is not counted at signing.
 */

/** The plans an agent actually sells. */
export const SELLABLE_PLANS: Plan[] = ['monthly', 'quarterly', 'annual'];

export interface AgentTerms {
  /** Share of each payment, as a fraction. 0.1 is the standard 10%. */
  commissionRate: number;
  /** Paid once per farm, on its first paid subscription. */
  activationBounty: number;
}

export const DEFAULT_TERMS: AgentTerms = { commissionRate: 0.1, activationBounty: 750 };

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** How many times a farm on this plan pays in a year. */
export function paymentsPerYear(plan: Plan): number {
  return 12 / PLAN_MONTHS[plan];
}

/** What lands every single time that farm pays, forever. */
export function commissionPerPayment(plan: Plan, terms: AgentTerms = DEFAULT_TERMS): number {
  return round(PLAN_PRICES[plan] * terms.commissionRate);
}

/**
 * What reaches the agent in the week they sign a farm.
 *
 * The number that decides whether the conversation was worth having, so it is the one to lead
 * with. On monthly the bounty is not included, because it genuinely has not been released yet.
 */
export function earnedAtSigning(plan: Plan, terms: AgentTerms = DEFAULT_TERMS): number {
  const first = commissionPerPayment(plan, terms);
  if (plan === 'monthly') return first;
  return round(first + terms.activationBounty);
}

/** Bounty plus every commission that farm generates in its first twelve months. */
export function earnedFirstYear(plan: Plan, terms: AgentTerms = DEFAULT_TERMS): number {
  return round(terms.activationBounty + commissionPerPayment(plan, terms) * paymentsPerYear(plan));
}

/**
 * What that same farm pays the agent every year afterwards, with no further work.
 *
 * The honest measure of what an agent is building. The bounty is gone, so this is purely the
 * share of a subscription that renews on its own.
 */
export function earnedEveryYearAfter(plan: Plan, terms: AgentTerms = DEFAULT_TERMS): number {
  return round(commissionPerPayment(plan, terms) * paymentsPerYear(plan));
}

/** A year of subscriptions from one farm, which is the revenue the agent's share comes out of. */
export function farmRevenuePerYear(plan: Plan): number {
  return PLAN_PRICES[plan] * paymentsPerYear(plan);
}

export interface BookRow {
  farms: number;
  /** Subscriptions those farms pay in a year. */
  revenuePerYear: number;
  /** The agent's recurring share of it, with no new signings at all. */
  yoursPerYear: number;
}

/**
 * What a book of farms is worth once it is built.
 *
 * Quarterly by default because that is the plan agents are told to lead with.
 */
export function bookValue(farmCounts: number[], plan: Plan = 'quarterly', terms: AgentTerms = DEFAULT_TERMS): BookRow[] {
  return farmCounts.map((farms) => ({
    farms,
    revenuePerYear: farms * farmRevenuePerYear(plan),
    yoursPerYear: round(farms * earnedEveryYearAfter(plan, terms)),
  }));
}
