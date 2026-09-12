import { verifyLicense, type LicensePayload } from './token';

/**
 * Turning a token into "may this farmer log a milking today".
 *
 * Kept pure and free of any database or React import so it can be run straight under Node in a
 * test, and so the two questions stay separate: `token.ts` asks whether we issued this code,
 * this file asks what today's date makes of it.
 */

/**
 * Days of continued access after a licence lapses.
 *
 * It exists for two reasons. A farmer who is a few days late paying should not lose the record of
 * a calving that happened this morning, and once renewals run through a server, a week without
 * signal must never be mistaken for a week without payment.
 */
export const GRACE_DAYS = 7;

/** How close to the end we start saying so out loud. */
export const RENEWAL_NOTICE_DAYS = 7;

/** How long the free month lasts. Started automatically on first launch. */
export const TRIAL_DAYS = 30;

export type LicenseStatus =
  /** No signed licence on file. Only `readLicenseStatus` returns this; a launch falls to the trial. */
  | { state: 'unactivated' }
  /** The free month, granted on first launch. No code, no account, no agent. */
  | { state: 'trial'; daysLeft: number }
  /** The free month has run out and nothing has been paid. */
  | { state: 'trial-ended' }
  | { state: 'invalid'; reason: string }
  | { state: 'active'; payload: LicensePayload; daysLeft: number }
  | { state: 'grace'; payload: LicensePayload; graceDaysLeft: number }
  | { state: 'expired'; payload: LicensePayload };

/** Where a self-granted trial stands today. */
export function readTrialStatus(trialStartedAt: string, today: string): LicenseStatus {
  // `exp` is the last day covered, so a trial started on the 1st runs through the 30th.
  const daysUsed = daysBetweenYmd(trialStartedAt, today);
  const daysLeft = TRIAL_DAYS - 1 - daysUsed;
  return daysLeft >= 0 ? { state: 'trial', daysLeft } : { state: 'trial-ended' };
}

function ymdToLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Today as a local YYYY-MM-DD, matching the date format the tokens carry. */
export function todayYmd(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds whole calendar months, clamping to the end of a short month.
 *
 * Licence lengths are counted in months rather than days so a renewal always lands on the same
 * date. Thirty-day "months" drift backwards through the calendar and quietly add a thirteenth
 * billing period every year, neither of which a farmer lining renewals up with a monthly milk
 * payout should have to think about. The 31st of January plus one month is the 28th of February,
 * not the 3rd of March.
 */
export function addMonthsYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  // Day zero of the month *after* the target is the target month's last day.
  const lastDayOfTarget = new Date(year, month - 1 + months + 1, 0).getDate();
  const shifted = new Date(year, month - 1 + months, Math.min(day, lastDayOfTarget));
  const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, '0');
  const shiftedDay = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${shiftedMonth}-${shiftedDay}`;
}

/** Whole days from one local date to another. Negative when `to` is in the past. */
export function daysBetweenYmd(from: string, to: string): number {
  // Rounding absorbs the ±1h a daylight-saving shift puts into the span.
  return Math.round((ymdToLocalDate(to).getTime() - ymdToLocalDate(from).getTime()) / 86_400_000);
}

/**
 * The date we are willing to treat as today.
 *
 * A phone's clock is set by whoever holds the phone, and winding it back a year is the obvious way
 * to make a subscription last forever. So every licence check records the latest date it has ever
 * seen, and a clock that disagrees by going *backwards* is ignored in favour of that high-water
 * mark. Moving the clock forward is not defended against, because doing so only ends your own
 * licence sooner.
 */
export function effectiveToday(deviceYmd: string, highWaterYmd: string | null | undefined): string {
  if (!highWaterYmd) return deviceYmd;
  return deviceYmd > highWaterYmd ? deviceYmd : highWaterYmd;
}

export function readLicenseStatus(
  token: string | null | undefined,
  publicKey: Uint8Array,
  today: string,
): LicenseStatus {
  if (!token) return { state: 'unactivated' };

  const verified = verifyLicense(token, publicKey);
  if (!verified.ok) return { state: 'invalid', reason: verified.reason };

  const { payload } = verified;
  // `exp` is the last day covered, so a licence ending today is still good today.
  const daysLeft = daysBetweenYmd(today, payload.exp);

  if (daysLeft >= 0) return { state: 'active', payload, daysLeft };
  if (daysLeft >= -GRACE_DAYS) return { state: 'grace', payload, graceDaysLeft: GRACE_DAYS + daysLeft };
  return { state: 'expired', payload };
}

/**
 * Whether new records may be written.
 *
 * Reading, exporting and backing up are deliberately not covered by this. A farmer's herd records
 * are the farmer's, and holding them hostage over a late payment would cost more in a village that
 * runs on word of mouth than the subscription is worth.
 */
export function canWrite(status: LicenseStatus): boolean {
  return status.state === 'active' || status.state === 'grace' || status.state === 'trial';
}

/** A short line for the settings screen and the renewal banner. */
export function describeStatus(status: LicenseStatus): string {
  switch (status.state) {
    case 'unactivated':
      return 'Not activated yet';
    case 'trial':
      if (status.daysLeft === 0) return 'Free month ends today';
      if (status.daysLeft === 1) return 'Free month ends tomorrow';
      return `${status.daysLeft} days left of your free month`;
    case 'trial-ended':
      return 'Your free month has ended';
    case 'invalid':
      return status.reason;
    case 'active':
      if (status.daysLeft === 0) return 'Ends today';
      if (status.daysLeft === 1) return 'Ends tomorrow';
      return `${status.daysLeft} days left`;
    case 'grace':
      return status.graceDaysLeft === 1
        ? 'Payment overdue — locks tomorrow'
        : `Payment overdue — locks in ${status.graceDaysLeft} days`;
    case 'expired':
      return 'Subscription ended';
  }
}
