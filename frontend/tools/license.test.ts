/**
 * Checks on the licence logic. Run with: npm run license:test
 *
 * These are the paths where a mistake is expensive in both directions — a farmer who paid being
 * locked out, or a forged code unlocking the app for nothing — so they get asserted rather than
 * eyeballed.
 */

import nacl from 'tweetnacl';
import { bytesToBase64Url, base64UrlToBytes, bytesToUtf8, utf8ToBytes } from '../lib/license/encoding';
import { PLANS, signLicense, verifyLicense, type LicensePayload } from '../lib/license/token';
import {
  GRACE_DAYS,
  REFERRAL_BONUS_DAYS,
  RENEWAL_NOTICE_DAYS,
  TRIAL_DAYS,
  addMonthsYmd,
  canWrite,
  daysBetweenYmd,
  effectiveToday,
  readLicenseStatus,
  readTrialStatus,
} from '../lib/license/status';
import { PLAN_PRICES, PURCHASABLE_PLANS, pricePerMonth } from '../lib/license/pricing';
import { isWriteRoute } from '../lib/license/writeRoutes';
import {
  bookValue,
  commissionPerPayment,
  earnedAtSigning,
  earnedEveryYearAfter,
  earnedFirstYear,
  farmRevenuePerYear,
  paymentsPerYear,
} from '../lib/agent/earnings';

let failures = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}`);
    failures++;
  }
}

const keys = nacl.sign.keyPair();
const otherKeys = nacl.sign.keyPair();

const payload: LicensePayload = {
  v: 1,
  acc: '254712345678',
  farm: 'Kimani Dairy',
  plan: 'monthly',
  iat: '2026-09-01',
  exp: '2026-10-01',
  agent: 'AGT-001',
};

console.log('\nencoding');
{
  const samples = ['', 'a', 'ab', 'abc', 'Kimani Dairy', 'Mūgĩkũyũ ☕ farm', '{"v":1}'];
  for (const sample of samples) {
    const round = bytesToUtf8(base64UrlToBytes(bytesToBase64Url(utf8ToBytes(sample))));
    check(`round trips ${JSON.stringify(sample)}`, round === sample);
  }

  const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 7) % 256);
  check('round trips 64 raw bytes', bytesToBase64Url(bytes) === bytesToBase64Url(base64UrlToBytes(bytesToBase64Url(bytes))));
  check('emits no padding', !bytesToBase64Url(Uint8Array.from([1])).includes('='));
}

console.log('\nsigning');
{
  const token = signLicense(payload, keys.secretKey);
  const good = verifyLicense(token, keys.publicKey);
  check('accepts a code we issued', good.ok);
  check('reads the payload back intact', good.ok && good.payload.acc === '254712345678' && good.payload.exp === '2026-10-01');

  check('rejects a code signed by another key', !verifyLicense(token, otherKeys.publicKey).ok);
  check('rejects an empty code', !verifyLicense('', keys.publicKey).ok);
  check('rejects something that is not a code', !verifyLicense('hello there', keys.publicKey).ok);
  check('rejects the wrong version prefix', !verifyLicense(token.replace(/^HC1/, 'HC2'), keys.publicKey).ok);

  // The interesting attack: swap in a later expiry date and keep the original signature.
  const [prefix, body, signature] = token.split('.');
  const tampered = JSON.parse(bytesToUtf8(base64UrlToBytes(body))) as LicensePayload;
  tampered.exp = '2099-01-01';
  const forged = `${prefix}.${bytesToBase64Url(utf8ToBytes(JSON.stringify(tampered)))}.${signature}`;
  check('rejects an extended expiry date', !verifyLicense(forged, keys.publicKey).ok);

  const truncated = `${prefix}.${body}.${signature.slice(0, -4)}`;
  check('rejects a code that was cut short', !verifyLicense(truncated, keys.publicKey).ok);
}

console.log('\nplans');
{
  check('the plan list is exactly what we recognise', PLANS.join(',') === 'trial,monthly,quarterly,annual,owner');
  check('only three plans are on the price list', PURCHASABLE_PLANS.join(',') === 'monthly,quarterly,annual');
  check('the owner licence is never offered for sale', !PURCHASABLE_PLANS.includes('owner' as never));
  check('the trial is never offered for sale', !PURCHASABLE_PLANS.includes('trial' as never));

  // The developer's own licence: a real signed code, checked exactly like any other, just long.
  const owner = signLicense({ ...payload, plan: 'owner', exp: '2126-01-01' }, keys.secretKey);
  const ownerRead = verifyLicense(owner, keys.publicKey);
  check('issues and reads an owner licence', ownerRead.ok && ownerRead.payload.plan === 'owner');
  check('an owner licence still has to be signed', !verifyLicense(owner, otherKeys.publicKey).ok);
  check('an owner licence permits writing', canWrite(readLicenseStatus(owner, keys.publicKey, '2026-09-11')));
  check('an owner licence costs nothing', PLAN_PRICES.owner === 0);

  const quarterly = signLicense({ ...payload, plan: 'quarterly', exp: '2026-12-01' }, keys.secretKey);
  const read = verifyLicense(quarterly, keys.publicKey);
  check('issues and reads a quarterly licence', read.ok && read.payload.plan === 'quarterly');

  check('the price list offers the three paid plans', PURCHASABLE_PLANS.join(',') === 'monthly,quarterly,annual');
  check('a longer plan always costs less per month', pricePerMonth('monthly') > pricePerMonth('quarterly')
    && pricePerMonth('quarterly') > pricePerMonth('annual'));
  check('the trial is free', PLAN_PRICES.trial === 0);

  // The perpetual plan is gone. A code carrying it must not quietly pass as something else.
  const perpetual = signLicense({ ...payload, plan: 'lifetime' as never }, keys.secretKey);
  check('rejects a retired perpetual licence', !verifyLicense(perpetual, keys.publicKey).ok);
}

console.log('\ndates');
{
  check('counts days forward', daysBetweenYmd('2026-09-01', '2026-09-08') === 7);
  check('counts days backward', daysBetweenYmd('2026-09-08', '2026-09-01') === -7);
  check('counts across a month end', daysBetweenYmd('2026-09-30', '2026-10-01') === 1);
  check('counts across a year end', daysBetweenYmd('2026-12-31', '2027-01-01') === 1);
}

console.log('\ncalendar months');
{
  check('a one-month trial lands on the same date next month', addMonthsYmd('2026-09-11', 1) === '2026-10-11');
  check('a quarter lands on the same date three months on', addMonthsYmd('2026-09-11', 3) === '2026-12-11');
  check('a year lands on the same date next year', addMonthsYmd('2026-09-11', 12) === '2027-09-11');

  // A short month must clamp rather than spill into the next one.
  check('31 Jan plus a month is 28 Feb', addMonthsYmd('2026-01-31', 1) === '2026-02-28');
  check('31 Jan plus a month in a leap year is 29 Feb', addMonthsYmd('2028-01-31', 1) === '2028-02-29');
  check('31 Mar plus a month is 30 Apr', addMonthsYmd('2026-03-31', 1) === '2026-04-30');
  check('30 Nov plus a quarter crosses the year end', addMonthsYmd('2026-11-30', 3) === '2027-02-28');

  // Twelve monthly renewals must add up to exactly one year, not thirteen billing periods.
  let cursor = '2026-01-15';
  for (let i = 0; i < 12; i++) cursor = addMonthsYmd(cursor, 1);
  check('twelve monthly renewals make exactly one year', cursor === '2027-01-15');
}

console.log('\nstatus');
{
  const token = signLicense(payload, keys.secretKey);
  const at = (today: string) => readLicenseStatus(token, keys.publicKey, today);

  check('unactivated with no token', readLicenseStatus(null, keys.publicKey, '2026-09-15').state === 'unactivated');
  check('active well before expiry', at('2026-09-15').state === 'active');
  check('still active on the expiry date itself', at('2026-10-01').state === 'active');
  check('in grace the day after expiry', at('2026-10-02').state === 'grace');
  check(`still in grace on the last grace day`, at('2026-10-08').state === 'grace');
  check('expired once grace runs out', at('2026-10-09').state === 'expired');

  check('grace is the documented length', daysBetweenYmd('2026-10-01', '2026-10-08') === GRACE_DAYS);

  check('writing allowed while active', canWrite(at('2026-09-15')));
  check('writing allowed during grace', canWrite(at('2026-10-05')));
  check('writing blocked once expired', !canWrite(at('2026-10-09')));
  check('writing blocked with no licence', !canWrite(readLicenseStatus(null, keys.publicKey, '2026-09-15')));
  check('writing blocked on a forged code', !canWrite(readLicenseStatus('HC1.aaa.bbb', keys.publicKey, '2026-09-15')));

  const daysLeft = at('2026-09-21');
  check('counts the days left correctly', daysLeft.state === 'active' && daysLeft.daysLeft === 10);
}


console.log('\nthe free month');
{
  const started = '2026-09-01';
  const at = (today: string) => readTrialStatus(started, today);

  check('day one is a trial', at('2026-09-01').state === 'trial');
  check('a new farmer can log immediately', canWrite(at('2026-09-01')));
  check('the whole first day counts', at('2026-09-01').state === 'trial' && (at('2026-09-01') as any).daysLeft === TRIAL_DAYS - 1);
  check('still running mid-month', canWrite(at('2026-09-20')));
  check('still running on the last day', at('2026-09-30').state === 'trial');
  check('the last day is day 30', daysBetweenYmd(started, '2026-09-30') === TRIAL_DAYS - 1);
  check('over the day after', at('2026-10-01').state === 'trial-ended');
  check('writing stops when it ends', !canWrite(at('2026-10-01')));
  check('and stays stopped', !canWrite(at('2026-12-25')));

  // Crossing a month boundary must not shorten or lengthen it.
  check('a trial started late in a month still gets 30 days', readTrialStatus('2026-01-20', '2026-02-18').state === 'trial');
  check('and ends on the 31st day', readTrialStatus('2026-01-20', '2026-02-19').state === 'trial-ended');

  // Referral bonus (+7 extra free trial days = 37 total days)
  check('referral adds 7 extra days to trial', (readTrialStatus(started, '2026-09-01', true) as any).daysLeft === TRIAL_DAYS + REFERRAL_BONUS_DAYS - 1);
  check('day 30 is still trial when referred', readTrialStatus(started, '2026-09-30', true).state === 'trial');
  check('day 37 is the last day when referred', readTrialStatus(started, '2026-10-07', true).state === 'trial');
  check('day 38 ends trial when referred', readTrialStatus(started, '2026-10-08', true).state === 'trial-ended');

  // The Today screen stays silent for the first three weeks so farmers can explore and build
  // their records freely. It only nudges them during the final week (<= 7 days left).
  const showsOnHome = (today: string) => {
    const st = at(today);
    return st.state === 'trial' && st.daysLeft <= RENEWAL_NOTICE_DAYS;
  };
  check('the home note is silent on day 1', !showsOnHome('2026-09-01'));
  check('the home note is silent on day 7', !showsOnHome('2026-09-07'));
  check('and stays silent mid-trial (day 20)', !showsOnHome('2026-09-20'));
  check('the home note appears one week out (day 23, 7 days left)', showsOnHome('2026-09-23'));
  check('the home note stays through the last day (day 30)', showsOnHome('2026-09-30'));
  check('and is gone after it ends', !showsOnHome('2026-10-01'));
}

console.log('\nclock tampering');
{
  check('uses the device date when it is ahead', effectiveToday('2026-10-05', '2026-10-01') === '2026-10-05');
  check('ignores a clock wound backwards', effectiveToday('2020-01-01', '2026-10-01') === '2026-10-01');
  check('accepts the device date with no history', effectiveToday('2026-10-05', null) === '2026-10-05');

  const token = signLicense(payload, keys.secretKey);
  // The farmer sets the phone back to last year to dodge an expiry. The high-water mark wins.
  const rolledBack = readLicenseStatus(token, keys.publicKey, effectiveToday('2025-01-01', '2026-10-20'));
  check('a rolled-back clock does not revive an expired licence', !canWrite(rolledBack));
}


console.log('\nagent earnings shown in the app');
{
  // These must equal what backend/src/commission.ts actually pays out. The backend suite asserts
  // the same figures from the other side; if the two ever disagree, an agent is being quoted a
  // number their M-Pesa will not match.
  check('monthly commission is 100 a payment', commissionPerPayment('monthly') === 100);
  check('quarterly commission is 280 a payment', commissionPerPayment('quarterly') === 280);
  check('annual commission is 1,000 a payment', commissionPerPayment('annual') === 1000);

  check('payments a year: monthly 12', paymentsPerYear('monthly') === 12);
  check('payments a year: quarterly 4', paymentsPerYear('quarterly') === 4);
  check('payments a year: annual 1', paymentsPerYear('annual') === 1);

  // The headline number, and the one an agent can check against their phone the same week.
  check('signing a quarterly farm pays 1,030', earnedAtSigning('quarterly') === 1030);
  check('signing an annual farm pays 1,750', earnedAtSigning('annual') === 1750);
  check('signing a monthly farm pays 100, bounty held', earnedAtSigning('monthly') === 100);

  check('first year, monthly, is 1,950', earnedFirstYear('monthly') === 1950);
  check('first year, quarterly, is 1,870', earnedFirstYear('quarterly') === 1870);
  check('first year, annual, is 1,750', earnedFirstYear('annual') === 1750);

  check('every year after, monthly, is 1,200', earnedEveryYearAfter('monthly') === 1200);
  check('every year after, quarterly, is 1,120', earnedEveryYearAfter('quarterly') === 1120);
  check('every year after, annual, is 1,000', earnedEveryYearAfter('annual') === 1000);

  check('a quarterly farm pays 11,200 a year', farmRevenuePerYear('quarterly') === 11200);

  const book = bookValue([10, 50, 100]);
  check('10 farms yield 11,200 a year', book[0].yoursPerYear === 11200);
  check('50 farms yield 56,000 a year', book[1].yoursPerYear === 56000);
  check('100 farms yield 112,000 a year', book[2].yoursPerYear === 112000);
  check(
    'the share really is a tenth of what those farms pay',
    book.every((r) => Math.round((r.yoursPerYear / r.revenuePerYear) * 100) === 10),
  );

  // A custom rate must flow through everywhere rather than only some places.
  const better = { commissionRate: 0.15, activationBounty: 1000 };
  check('a 15% rate changes the per-payment figure', commissionPerPayment('quarterly', better) === 420);
  check('and the signing figure', earnedAtSigning('quarterly', better) === 1420);
  check('and the recurring figure', earnedEveryYearAfter('quarterly', better) === 1680);
}

console.log('\nwrite routes');
{
  const blocked = [
    '/log',
    '/log/milk',
    '/log/breeding',
    '/animal/new',
    '/animal/abc-123/edit',
    '/flock/new',
    '/flock/abc-123/edit',
    '/flock/abc-123/log',
    '/customers/new',
    '/customers/abc-123/deliver',
    '/customers/abc-123/pay',
    '/suppliers/new',
    '/suppliers/abc-123/pay',
    '/hatch/new',
    '/hatch/abc-123/candle',
    '/hatch/abc-123/hatch',
    '/expense/new',
    '/income/new',
    '/money/new',
    '/schedule/new',
  ];
  for (const path of blocked) check(`blocks ${path}`, isWriteRoute(path));

  const open = [
    '/',
    '/animals',
    '/money',
    '/settings',
    '/reminders',
    '/activate',
    '/animal/abc-123',
    '/flock/abc-123',
    '/hatch/abc-123',
    '/customers',
    '/customers/abc-123',
    '/suppliers',
    '/suppliers/abc-123',
  ];
  for (const path of open) check(`allows ${path}`, !isWriteRoute(path));
}

console.log(failures === 0 ? '\nAll licence checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
