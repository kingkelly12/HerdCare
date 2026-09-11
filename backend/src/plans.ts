/**
 * Plans, lengths and prices. Mirrors frontend/lib/license/token.ts and pricing.ts.
 *
 * Changing a price here changes what the service records against a payment; it can never change
 * what a farmer already bought, because a token carries the plan and the dates but no amount.
 */

export const PLANS = ['trial', 'monthly', 'quarterly', 'annual', 'owner'] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}

/** Whole calendar months, so every renewal lands on the same date rather than drifting. */
export const PLAN_MONTHS: Record<Plan, number> = {
  trial: 1,
  monthly: 1,
  quarterly: 3,
  annual: 12,
  // A century. `owner` is how whoever runs HerdCare holds a licence without paying themselves.
  // It is never sold, never earns an agent anything, and is only issued deliberately.
  owner: 1200,
};

export const PRICE_CURRENCY = 'KES';

export const PLAN_PRICES: Record<Plan, number> = {
  trial: 0,
  owner: 0,
  monthly: 1_000,
  quarterly: 2_800,
  annual: 10_000,
};

/**
 * Today in Nairobi, as YYYY-MM-DD.
 *
 * Workers run in UTC, and Kenya is UTC+3. Without this, a code issued after 9pm local time would
 * be dated to the previous day and quietly cost the farmer a day of what they paid for.
 */
export function todayInNairobi(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape the tokens use.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(now);
}

/** Adds whole calendar months, clamping to the end of a short month. */
export function addMonthsYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  // Day zero of the month after the target is the target month's last day.
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  const shifted = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDayOfTarget)));
  return shifted.toISOString().slice(0, 10);
}

/** Whole days between two local dates. Negative when `to` is already past. */
export function daysBetweenYmd(from: string, to: string): number {
  // Date.UTC takes a 0-based month, so the `- 1` is load-bearing. Spreading the parts straight in
  // would shift both dates a month forward, which looks harmless but gives the wrong answer across
  // months of different lengths.
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  const a = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const b = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((b - a) / 86_400_000);
}
