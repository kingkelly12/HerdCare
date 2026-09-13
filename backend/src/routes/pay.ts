import { Hono } from 'hono';
import type { Env, FarmRow, PendingPaymentRow } from '../types';
import { normalisePhone } from '../license';
import { PLAN_PRICES, PRICE_CURRENCY, isPlan, todayInNairobi } from '../plans';
import { callbackMatchesPending, getPaymentProvider } from '../payments';
import { secretsMatch } from '../crypto';
import { applyPayment } from '../subscription';

/**
 * Paying without anybody's help.
 *
 * The farmer taps Renew, their own phone asks for their M-Pesa PIN, and the app unlocks a few
 * seconds later. No till number to copy, no receipt to forward, no agent to wait for.
 *
 * This is the one place the app is allowed to need a network. Everything else works in a field
 * with no signal; paying money to Safaricom cannot.
 */

export const pay = new Hono<{ Bindings: Env }>();

/** Starts an STK push. The app polls `/pay/:checkoutId` afterwards. */
pay.post('/', async (c) => {
  const provider = getPaymentProvider(c.env);
  if (!provider.isConfigured()) {
    return c.json({ error: 'Paying in the app is not switched on yet. Pay your agent instead.' }, 503);
  }
  if (!c.env.PUBLIC_BASE_URL || !c.env.MPESA_CALLBACK_SECRET) {
    return c.json({ error: 'Payment is misconfigured. See the README.' }, 500);
  }

  const body = await c.req.json().catch(() => null);
  const rawPhone = (body as any)?.phone;
  const plan = (body as any)?.plan;

  if (typeof rawPhone !== 'string' || !rawPhone.trim()) return c.json({ error: 'Enter your M-Pesa number.' }, 400);
  // Only the three paid plans are purchasable. A trial is something an agent grants, and an owner
  // licence is not for sale at any price — without this, both could be bought for nothing.
  if (!isPlan(plan) || plan === 'trial' || plan === 'owner') {
    return c.json({ error: 'Choose monthly, quarterly or annual.' }, 400);
  }

  const phone = normalisePhone(rawPhone);
  const amount = PLAN_PRICES[plan];

  // If a push is already outstanding for this number, do not send another. Two prompts on one
  // handset is how a farmer ends up paying twice for the same month.
  const outstanding = await c.env.DB.prepare(
    "SELECT * FROM pending_payments WHERE phone = ? AND status = 'pending' AND created_at > ?",
  )
    .bind(phone, new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .first<PendingPaymentRow>();

  if (outstanding) {
    return c.json({
      checkoutId: outstanding.checkout_request_id,
      message: 'Check your phone, there is already a payment request waiting.',
      amount: outstanding.amount,
      currency: PRICE_CURRENCY,
    });
  }

  const rawAgent = (body as any)?.agent;
  const agentCode = typeof rawAgent === 'string' && rawAgent.trim() ? rawAgent.trim().toUpperCase() : null;

  let farm = await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(phone).first<FarmRow>();

  if (!farm) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO farms (id, phone, name, agent_code, plan, expires_at, activated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, phone, '', agentCode, 'trial', todayInNairobi(), now, now)
      .run();
    farm = {
      id,
      phone,
      name: '',
      agent_code: agentCode,
      plan: 'trial',
      expires_at: todayInNairobi(),
      activated_at: now,
      updated_at: now,
    };
  } else if (!farm.agent_code && agentCode) {
    await c.env.DB.prepare('UPDATE farms SET agent_code = ?, updated_at = ? WHERE id = ?')
      .bind(agentCode, new Date().toISOString(), farm.id)
      .run();
    farm = { ...farm, agent_code: agentCode };
  }

  // The row id is generated before the push so it can travel as our own reference, giving a
  // second way to match the callback besides whatever id the provider issues.
  const pendingId = crypto.randomUUID();

  let push;
  try {
    push = await provider.push({
      phone,
      amount,
      reference: pendingId,
      callbackUrl: `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/pay/callback/${c.env.MPESA_CALLBACK_SECRET}`,
      description: 'Subscription',
    });
  } catch (error) {
    console.error(`${provider.name} push failed`, error);
    return c.json({ error: error instanceof Error ? error.message : 'Could not start the payment.' }, 502);
  }

  await c.env.DB.prepare(
    `INSERT INTO pending_payments (id, checkout_request_id, merchant_request_id, farm_id, phone, plan, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(pendingId, push.reference, push.providerRef, farm?.id ?? null, phone, plan, amount)
    .run();

  return c.json({
    checkoutId: push.reference,
    message: push.customerMessage,
    amount,
    currency: PRICE_CURRENCY,
  });
});

/**
 * Where the app waits.
 *
 * Polling rather than a push notification: the app is already open and watching, the wait is
 * seconds, and it avoids standing up push infrastructure for one screen.
 */
pay.get('/:checkoutId', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM pending_payments WHERE checkout_request_id = ?')
    .bind(c.req.param('checkoutId'))
    .first<PendingPaymentRow>();

  if (!row) return c.json({ error: 'No such payment.' }, 404);

  if (row.status !== 'paid') {
    return c.json({ status: row.status, detail: row.result_desc ?? 'Waiting for your M-Pesa PIN.' });
  }

  const farm = row.farm_id
    ? await c.env.DB.prepare('SELECT * FROM farms WHERE id = ?').bind(row.farm_id).first<FarmRow>()
    : await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(row.phone).first<FarmRow>();

  if (!farm) return c.json({ status: 'paid', detail: 'Paid, but no subscription was found.' });

  // Read back the code the callback already issued rather than signing a fresh one. A phone polls
  // every couple of seconds, and re-signing on each poll would write an audit row every time.
  const latest = await c.env.DB.prepare(
    'SELECT token FROM issued_licenses WHERE farm_id = ? ORDER BY issued_at DESC LIMIT 1',
  )
    .bind(farm.id)
    .first<{ token: string }>();

  const token = latest?.token ?? (await applyPayment(c.env, { farm, plan: farm.plan as any, reissueOnly: true })).token;

  return c.json({
    status: 'paid',
    receipt: row.mpesa_ref,
    farm: { phone: farm.phone, plan: farm.plan, expiresAt: farm.expires_at },
    token,
  });
});

/**
 * Safaricom's callback.
 *
 * Daraja callbacks carry no signature and no shared secret, so nothing in the request may be
 * trusted on its own. Three things guard it, and all three have to hold:
 *
 *   1. the path carries an unguessable secret segment;
 *   2. the CheckoutRequestID must match a pending row that *we* created;
 *   3. the amount and payer must match what we asked Safaricom for.
 *
 * Always answer 200. Safaricom retries anything else, and a retry storm against an endpoint that
 * is already refusing the request helps nobody.
 */
pay.post('/callback/:secret', async (c) => {
  const ok = c.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const expected = c.env.MPESA_CALLBACK_SECRET ?? '';
  if (!expected || !secretsMatch(c.req.param('secret'), expected)) {
    console.warn('Payment callback with a bad secret segment');
    return ok;
  }

  const provider = getPaymentProvider(c.env);
  const body = await c.req.json().catch(() => null);

  // The path secret proves only that somebody knew the URL. Each provider gets to apply its own
  // check on top — a shared challenge, a signature — and a callback that fails it is not ours.
  if (!provider.authenticateCallback(body, c.req.param('secret'))) {
    console.warn(`${provider.name} callback failed authentication`);
    return ok;
  }

  const callback = provider.parseCallback(body);
  if (!callback) {
    console.warn(`${provider.name} callback that did not parse`);
    return ok;
  }

  // Aggregators report progress as well as outcomes. A "still processing" notice is not news.
  if (callback.pending) return ok;

  const pending = await c.env.DB.prepare('SELECT * FROM pending_payments WHERE checkout_request_id = ?')
    .bind(callback.reference)
    .first<PendingPaymentRow>();

  if (!pending) {
    // Either a forgery or a callback for a push we have no record of. Either way, credit nothing.
    console.warn(`${provider.name} callback for an unknown payment`, callback.reference);
    return ok;
  }

  const verdict = callbackMatchesPending(callback, pending);

  if (!verdict.ok) {
    await c.env.DB.prepare(
      'UPDATE pending_payments SET status = ?, result_desc = ?, settled_at = ? WHERE id = ?',
    )
      .bind(
        callback.succeeded ? 'rejected' : 'failed',
        verdict.reason,
        new Date().toISOString(),
        pending.id,
      )
      .run();

    return ok;
  }

  await c.env.DB.prepare(
    "UPDATE pending_payments SET status = 'paid', result_desc = ?, mpesa_ref = ?, settled_at = ? WHERE id = ?",
  )
    .bind(callback.detail, callback.receipt, new Date().toISOString(), pending.id)
    .run();

  const farm = pending.farm_id
    ? await c.env.DB.prepare('SELECT * FROM farms WHERE id = ?').bind(pending.farm_id).first<FarmRow>()
    : await c.env.DB.prepare('SELECT * FROM farms WHERE phone = ?').bind(pending.phone).first<FarmRow>();

  if (!farm) {
    // Money arrived from a number with no subscription. Do not silently keep it: this needs a
    // human, and the row above is the record they will need.
    console.error('Payment received for an unknown farm', pending.phone, callback.receipt);
    return ok;
  }

  await applyPayment(c.env, {
    farm,
    plan: pending.plan as any,
    amount: callback.amount ?? pending.amount,
    mpesaRef: callback.receipt,
  });

  return ok;
});
