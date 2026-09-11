/**
 * The phase-zero licence desk: generates the signing key and issues activation codes by hand.
 *
 * This is deliberately a local script rather than a server. It costs nothing to run, it proves the
 * whole activation path end to end, and when the Cloudflare Worker arrives it changes only *where*
 * `signLicense` is called — the token format, the public key in the app, and every code already in
 * a farmer's hands all stay valid.
 *
 *   npm run license -- keygen
 *   npm run license -- issue --phone 0712345678 --farm "Kimani Dairy" --plan monthly --agent AGT-001
 *   npm run license -- issue --phone 0712345678 --farm "Kimani Dairy" --plan trial
 *   npm run license -- verify HC1.xxxx.yyyy
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import nacl from 'tweetnacl';
import { bytesToBase64Url, base64UrlToBytes } from '../lib/license/encoding';
import { PLANS, PLAN_LABELS, signLicense, verifyLicense, type LicensePayload, type Plan } from '../lib/license/token';
import { addMonthsYmd } from '../lib/license/status';
// Months rather than days so every renewal falls on the same date, and so the length a farmer
// is sold matches the length the price list divides by.
import { PLAN_MONTHS, PLAN_PRICES, PRICE_CURRENCY } from '../lib/license/pricing';

// Resolved against the package root rather than this file, because the bundle esbuild hands to
// Node lives under node_modules/.cache. `npm run` always executes from the package root.
const ROOT = process.cwd();
const KEY_FILE = join(ROOT, 'tools', '.license-key.json');
const PUBLIC_KEY_MODULE = join(ROOT, 'lib', 'license', 'publicKey.ts');

function ymdToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[month - 1]} ${year}`;
}

/**
 * Kenyan numbers get written every which way. Store one shape so a payment notification can be
 * matched to a farm without a human squinting at it.
 */
function normalisePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      out[key] = 'true';
    } else {
      out[key] = value;
      i++;
    }
  }
  return out;
}

function loadKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  if (!existsSync(KEY_FILE)) {
    console.error('No signing key yet. Run this first:\n\n  npm run license -- keygen\n');
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as { publicKey: string; secretKey: string };
  return {
    publicKey: base64UrlToBytes(stored.publicKey),
    secretKey: base64UrlToBytes(stored.secretKey),
  };
}

function keygen() {
  if (existsSync(KEY_FILE)) {
    console.error(
      `A signing key already exists at ${KEY_FILE}.\n\n` +
        'Generating a new one would invalidate every code already in the field. Delete that file by\n' +
        'hand first if you really mean to start over.\n',
    );
    process.exit(1);
  }

  const pair = nacl.sign.keyPair();
  const publicKey = bytesToBase64Url(pair.publicKey);

  mkdirSync(dirname(KEY_FILE), { recursive: true });
  writeFileSync(
    KEY_FILE,
    JSON.stringify({ publicKey, secretKey: bytesToBase64Url(pair.secretKey) }, null, 2),
    { mode: 0o600 },
  );

  const module = readFileSync(PUBLIC_KEY_MODULE, 'utf8').replace(
    /const PUBLIC_KEY_BASE64URL = '[^']*';/,
    `const PUBLIC_KEY_BASE64URL = '${publicKey}';`,
  );
  writeFileSync(PUBLIC_KEY_MODULE, module);

  console.log(
    [
      'Signing key created.',
      '',
      `  Private key   ${KEY_FILE}`,
      '                (git-ignored, never ships, back it up somewhere safe)',
      `  Public key    written into lib/license/publicKey.ts`,
      '',
      'Losing the private key means never being able to issue or renew a code for any phone',
      'already carrying this build, so put a copy somewhere you trust before you go any further.',
      '',
    ].join('\n'),
  );
}

/**
 * Prints the raw 32-byte signing seed and nothing else, so it can be piped straight into
 * `wrangler secret put` without ever appearing on screen or in shell history:
 *
 *   npm run --silent license -- seed | npx wrangler secret put LICENSE_SIGNING_SEED
 *
 * tweetnacl stores a 64-byte secret key as [32-byte seed][32-byte public key]. The Worker signs
 * with WebCrypto, which wants just the seed, and Ed25519 is deterministic — so both sides produce
 * byte-identical signatures and every code already issued stays valid.
 */
function seed() {
  const { secretKey } = loadKeys();
  process.stdout.write(bytesToBase64Url(secretKey.slice(0, 32)));
}

function issue(args: Record<string, string>) {
  const { secretKey, publicKey } = loadKeys();

  const phone = args.phone ?? args.p;
  if (!phone) {
    console.error('Which farmer? Pass --phone 0712345678\n');
    process.exit(1);
  }

  const plan = (args.plan ?? 'monthly') as Plan;
  if (!PLANS.includes(plan)) {
    console.error(`Unknown plan "${plan}". Pick one of: ${PLANS.join(', ')}\n`);
    process.exit(1);
  }

  // A renewal should extend from the old expiry, not from today, so a farmer who pays early is
  // not quietly charged for the days they had already bought.
  const from = args.from ?? ymdToday();

  // `--days` stays as an escape hatch for an odd case (a goodwill extension, a part month), but
  // the plans themselves are counted in months.
  let expiry: string;
  if (args.days) {
    const days = Number(args.days);
    if (!Number.isFinite(days) || days <= 0) {
      console.error('--days must be a positive number of days.\n');
      process.exit(1);
    }
    expiry = addDaysYmd(from, days);
  } else {
    expiry = addMonthsYmd(from, PLAN_MONTHS[plan]);
  }

  const payload: LicensePayload = {
    v: 1,
    acc: normalisePhone(phone),
    farm: args.farm ?? '',
    plan,
    iat: ymdToday(),
    exp: expiry,
    agent: args.agent ?? null,
  };

  const token = signLicense(payload, secretKey);

  // Never hand out a code without checking it the way the app will.
  const check = verifyLicense(token, publicKey);
  if (!check.ok) {
    console.error(`The code failed its own check: ${check.reason}`);
    process.exit(1);
  }

  const link = `herdcare://activate?token=${token}`;
  const greeting = payload.farm ? `Karibu HerdCare, ${payload.farm}.` : 'Karibu HerdCare.';

  console.log(
    [
      '',
      `  Farm       ${payload.farm || '—'}`,
      `  M-Pesa     ${payload.acc}`,
      `  Plan       ${PLAN_LABELS[plan]}`,
      `  Price      ${plan === 'trial' ? 'free' : `${PRICE_CURRENCY} ${PLAN_PRICES[plan].toLocaleString('en-KE')}`}`,
      `  Covers     ${formatYmd(from)} to ${formatYmd(payload.exp)}`,
      `  Agent      ${payload.agent ?? 'direct sale'}`,
      '',
      '  Send this on WhatsApp, and have them tap it on the phone with HerdCare installed:',
      '',
      `${greeting}`,
      `Tap here to unlock your app: ${link}`,
      '',
      '  Or have them paste this into Settings, then Subscription:',
      '',
      token,
      '',
    ].join('\n'),
  );
}

function verify(token: string) {
  const { publicKey } = loadKeys();
  const result = verifyLicense(token, publicKey);

  if (!result.ok) {
    console.log(`\n  Not valid: ${result.reason}\n`);
    process.exit(1);
  }

  const { payload } = result;
  console.log(
    [
      '',
      '  Valid signature.',
      '',
      `  Farm       ${payload.farm || '—'}`,
      `  M-Pesa     ${payload.acc}`,
      `  Plan       ${PLAN_LABELS[payload.plan]}`,
      `  Issued     ${formatYmd(payload.iat)}`,
      `  Covers to  ${formatYmd(payload.exp)}`,
      `  Agent      ${payload.agent ?? 'direct sale'}`,
      '',
    ].join('\n'),
  );
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

switch (command) {
  case 'keygen':
    keygen();
    break;
  case 'issue':
    issue(args);
    break;
  case 'verify':
    verify(rest[0] ?? '');
    break;
  case 'seed':
    seed();
    break;
  default:
    console.log(
      [
        '',
        '  HerdCare licence desk',
        '',
        '    npm run license -- keygen',
        '    npm run license -- issue --phone 0712345678 --farm "Kimani Dairy" --plan monthly --agent AGT-001',
        '    npm run license -- issue --phone 0712345678 --farm "Kimani Dairy" --plan trial',
        '    npm run license -- issue --phone 0712345678 --plan monthly --from 2026-10-11   (renewal)',
        '    npm run license -- verify HC1.xxxx.yyyy',
        '',
        '  Handing signing over to the Cloudflare Worker (see ../backend/README.md):',
        '    npm run --silent license -- seed | npx wrangler secret put LICENSE_SIGNING_SEED',
        '',
        `  Plans: ${PLANS.join(', ')}`,
        '',
      ].join('\n'),
    );
}
