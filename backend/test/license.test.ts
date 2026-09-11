/**
 * Checks on the licence service. Run with: npm test
 *
 * The one that matters most is the cross-check against the app's own verifier. This Worker signs
 * with WebCrypto; the app verifies with tweetnacl; phase zero signed from a laptop, also with
 * tweetnacl. All three have to agree exactly, or a farmer gets a code their app rejects.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// The library the app verifies with. A dev dependency here purely so this test can prove the
// Worker's WebCrypto signatures and the app's tweetnacl verifier agree.
import nacl from 'tweetnacl';
import { signLicense, normalisePhone, readUnverifiedPayload, type LicensePayload } from '../src/license';
import { addMonthsYmd, daysBetweenYmd, todayInNairobi, PLAN_PRICES } from '../src/plans';
import { calculateCommission, releasableBounty } from '../src/commission';
import { base64UrlToBytes, bytesToBase64Url, utf8ToBytes } from '../src/encoding';
import { callbackMatchesPending, darajaTimestamp, stkPassword } from '../src/payments';
import { createDaraja } from '../src/payments/daraja';
import { renewalStart } from '../src/subscription';
import { randomOtp, randomToken, secretsMatch, sha256Hex } from '../src/crypto';

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`  ${condition ? 'ok   ' : 'FAIL '} ${name}`);
  if (!condition) failures++;
}

// Resolved from the package root, not this file: esbuild puts the bundle under
// node_modules/.cache, and `npm test` always runs from the package root.
const keyFile = join(process.cwd(), '..', 'frontend', 'tools', '.license-key.json');
const stored = JSON.parse(readFileSync(keyFile, 'utf8')) as { publicKey: string; secretKey: string };
const secretKey = base64UrlToBytes(stored.secretKey);
const publicKey = base64UrlToBytes(stored.publicKey);
const seed = bytesToBase64Url(secretKey.slice(0, 32));

const payload: LicensePayload = {
  v: 1,
  acc: '254712345678',
  farm: 'Kimani Dairy',
  plan: 'quarterly',
  iat: '2026-09-11',
  exp: '2026-12-11',
  agent: 'AGT-001',
};

async function main() {
  console.log('\nsigning, cross-checked against the app');
  {
    const token = await signLicense(payload, seed);
    const [prefix, body, signature] = token.split('.');

    check('produces a HC1 token in three parts', prefix === 'HC1' && !!body && !!signature);
    check('signature is 64 bytes', base64UrlToBytes(signature).length === 64);

    // The decisive one: would the app accept this?
    const appAccepts = nacl.sign.detached.verify(
      utf8ToBytes(`HC1.${body}`),
      base64UrlToBytes(signature),
      publicKey,
    );
    check("the app's verifier accepts a Worker-signed code", appAccepts);

    // And is it the very same code the laptop tool would have produced?
    const fromLaptop = nacl.sign.detached(utf8ToBytes(`HC1.${body}`), secretKey);
    check('byte-identical to the phase-zero laptop tool', bytesToBase64Url(fromLaptop) === signature);

    const wrongKey = nacl.sign.keyPair();
    check(
      'a code signed with another key is rejected',
      !nacl.sign.detached.verify(utf8ToBytes(`HC1.${body}`), base64UrlToBytes(signature), wrongKey.publicKey),
    );

    const round = readUnverifiedPayload(token);
    check('payload round-trips intact', round?.acc === payload.acc && round?.exp === payload.exp);
    check('rejects a malformed token', readUnverifiedPayload('not-a-token') === null);
    check('rejects the wrong version prefix', readUnverifiedPayload(token.replace(/^HC1/, 'HC2')) === null);
  }

  console.log('\nphone normalisation');
  {
    for (const input of ['0712345678', '+254712345678', '254712345678', '254 712 345 678', '712345678']) {
      check(`${input.padEnd(17)} -> 254712345678`, normalisePhone(input) === '254712345678');
    }
  }

  console.log('\ndates');
  {
    check('one month lands on the same date', addMonthsYmd('2026-09-11', 1) === '2026-10-11');
    check('a quarter is three months on', addMonthsYmd('2026-09-11', 3) === '2026-12-11');
    check('a year is twelve months on', addMonthsYmd('2026-09-11', 12) === '2027-09-11');
    check('31 Jan plus a month clamps to 28 Feb', addMonthsYmd('2026-01-31', 1) === '2026-02-28');
    check('and to 29 Feb in a leap year', addMonthsYmd('2028-01-31', 1) === '2028-02-29');
    check('days across uneven months', daysBetweenYmd('2026-01-31', '2026-02-28') === 28);
    check('days backwards are negative', daysBetweenYmd('2026-09-08', '2026-09-01') === -7);
    check('today reads as a plain date', /^\d{4}-\d{2}-\d{2}$/.test(todayInNairobi()));

    // Workers run in UTC; Kenya is UTC+3. Late evening in Nairobi is still the same local day.
    const lateEveningNairobi = new Date('2026-09-11T21:30:00+03:00');
    check('9:30pm in Nairobi is still the 11th', todayInNairobi(lateEveningNairobi) === '2026-09-11');
  }

  console.log('\ncommission');
  {
    const agent = { commissionRate: 0.1, activationBounty: 750 };

    const firstQuarterly = calculateCommission({ plan: 'quarterly', amount: 2800, ...agent, priorPayments: 0 });
    check('quarterly pays bounty immediately', firstQuarterly.bounty === 750 && firstQuarterly.commission === 280);

    const firstAnnual = calculateCommission({ plan: 'annual', amount: 10000, ...agent, priorPayments: 0 });
    check('annual pays bounty immediately', firstAnnual.bounty === 750 && firstAnnual.commission === 1000);

    const firstMonthly = calculateCommission({ plan: 'monthly', amount: 1000, ...agent, priorPayments: 0 });
    check('monthly holds the bounty back', firstMonthly.bounty === 0 && firstMonthly.commission === 100);

    const secondMonthly = calculateCommission({ plan: 'monthly', amount: 1000, ...agent, priorPayments: 1 });
    check('a later payment pays commission only', secondMonthly.bounty === 0 && secondMonthly.commission === 100);

    const trial = calculateCommission({ plan: 'trial', amount: 0, ...agent, priorPayments: 0 });
    check('a trial earns nothing at all', trial.commission === 0 && trial.bounty === 0);

    // The owner licence is the developer's own. It is not a sale, so nobody earns on it.
    const owner = calculateCommission({ plan: 'owner', amount: 0, ...agent, priorPayments: 0 });
    check('an owner licence earns nothing at all', owner.commission === 0 && owner.bounty === 0);
    check('an owner licence is priced at zero', PLAN_PRICES.owner === 0);

    check(
      'the held monthly bounty is released on payment two',
      releasableBounty({
        plan: 'monthly',
        priorPayments: 1,
        firstPaymentPlan: 'monthly',
        activationBounty: 750,
        bountyAlreadyPaid: false,
      }) === 750,
    );
    check(
      'but never released twice',
      releasableBounty({
        plan: 'monthly',
        priorPayments: 1,
        firstPaymentPlan: 'monthly',
        activationBounty: 750,
        bountyAlreadyPaid: true,
      }) === 0,
    );
    check(
      'and not on payment three',
      releasableBounty({
        plan: 'monthly',
        priorPayments: 2,
        firstPaymentPlan: 'monthly',
        activationBounty: 750,
        bountyAlreadyPaid: false,
      }) === 0,
    );

    // The whole point of the flat bounty: an agent should not care which plan is chosen.
    const yearOn = (plan: 'monthly' | 'quarterly' | 'annual', payments: number) => {
      let total = 0;
      for (let i = 0; i < payments; i++) {
        total += calculateCommission({ plan, amount: PLAN_PRICES[plan], ...agent, priorPayments: i }).total;
        // Quarterly and annual already include the bounty in that total. Only monthly holds it
        // back, so only monthly has anything to release on its second payment.
        total += releasableBounty({
          plan,
          priorPayments: i,
          firstPaymentPlan: plan,
          activationBounty: agent.activationBounty,
          bountyAlreadyPaid: false,
        });
      }
      return total;
    };
    const monthly = yearOn('monthly', 12);
    const quarterly = yearOn('quarterly', 4);
    const annual = yearOn('annual', 1);
    const spread = Math.max(monthly, quarterly, annual) - Math.min(monthly, quarterly, annual);
    console.log(`         year one: monthly ${monthly}, quarterly ${quarterly}, annual ${annual}`);
    check('a year earns within KES 250 whichever plan is sold', spread <= 250);
  }


  console.log('\nrenewal start date');
  {
    check('an early renewal extends from the old expiry', renewalStart('2026-09-11', '2026-10-01') === '2026-10-01');
    check('a lapsed farm restarts from today', renewalStart('2026-09-11', '2026-06-01') === '2026-09-11');
    check('a brand new farm starts from today', renewalStart('2026-09-11', null) === '2026-09-11');
    check('expiring today restarts from today', renewalStart('2026-09-11', '2026-09-11') === '2026-09-11');
  }

  console.log('\nM-Pesa callbacks');
  {
    const pending = { phone: '254712345678', amount: 2800, status: 'pending' };
    const daraja = createDaraja({ consumerKey: 'a', consumerSecret: 'b', shortCode: '174379', passKey: 'p' });

    check('a half-filled config is not treated as ready', !createDaraja({ consumerKey: 'a' }).isConfigured());
    check('a complete config is', daraja.isConfigured());

    const genuine = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'm1',
          CheckoutRequestID: 'ws_CO_1',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 2800 },
              { Name: 'MpesaReceiptNumber', Value: 'SJK4H2M9QP' },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    };

    const parsed = daraja.parseCallback(genuine)!;
    check('parses a real callback envelope', parsed.receipt === 'SJK4H2M9QP' && parsed.amount === 2800);
    check('accepts a genuine success', callbackMatchesPending(parsed, pending).ok);
    check('returns null for junk', daraja.parseCallback({ hello: 'world' }) === null);
    check('returns null for nothing at all', daraja.parseCallback(null) === null);
    check(
      'reads a cancelled prompt as a failure',
      daraja.parseCallback({ Body: { stkCallback: { CheckoutRequestID: 'x', ResultCode: 1032, ResultDesc: 'c' } } })
        ?.succeeded === false,
    );

    // Each of these is a way somebody could try to buy a subscription for nothing.
    check('refuses a short payment', !callbackMatchesPending({ ...parsed, amount: 1 }, pending).ok);
    check('refuses a success with no receipt', !callbackMatchesPending({ ...parsed, receipt: null }, pending).ok);
    check(
      'refuses a payment from another number',
      !callbackMatchesPending({ ...parsed, payer: '254799999999' }, pending).ok,
    );
    check(
      'refuses to settle the same payment twice',
      !callbackMatchesPending(parsed, { ...pending, status: 'paid' }).ok,
    );
    check('accepts an overpayment', callbackMatchesPending({ ...parsed, amount: 3000 }, pending).ok);

    check('timestamp is 14 digits', /^\d{14}$/.test(darajaTimestamp()));
    check(
      'password is base64 of shortcode+passkey+timestamp',
      stkPassword('174379', 'abc', '20260911120000') === btoa('174379abc20260911120000'),
    );
  }

  console.log('\nsecrets');
  {
    check('otp is six digits', /^\d{6}$/.test(randomOtp()));
    check('otp codes do not repeat', new Set(Array.from({ length: 200 }, () => randomOtp())).size > 150);
    check('device tokens are 256-bit', base64UrlToBytes(randomToken()).length === 32);
    check('device tokens are unique', new Set(Array.from({ length: 100 }, () => randomToken())).size === 100);
    check('hashing is stable', (await sha256Hex('hello')) === (await sha256Hex('hello')));
    check('hashing separates inputs', (await sha256Hex('hello')) !== (await sha256Hex('hellp')));
    check('a hash does not reveal its input', !(await sha256Hex('123456')).includes('123456'));
    check('matching secrets compare equal', secretsMatch('abc123', 'abc123'));
    check('different secrets do not', !secretsMatch('abc123', 'abc124'));
    check('different lengths do not', !secretsMatch('abc', 'abcd'));
  }

  console.log(failures === 0 ? '\nAll backend checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
