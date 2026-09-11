# HerdCare agent commission

**For agents, and for whoever runs HerdCare.** One document, so both sides are reading the same
numbers. If anything here disagrees with what you were told verbally, this document is what counts.

Last updated: September 2026. Prices in Kenya Shillings.

---

## 1. What the role is

You sign farmers up to HerdCare and help them keep using it. You are not an employee. You are paid
on results, you set your own hours, and you can stop whenever you like.

The role suits people farmers **already come to**: agrovet shop owners, artificial insemination
technicians, veterinary officers, and dairy cooperative clerks. If you already meet farmers in the
course of your work, this is extra income for conversations you are having anyway. If you would
have to make a special trip to a farm to sign one farmer, the numbers below will not work for you.

---

## 2. What you earn

Two things, on every farm you sign.

| | What | When |
|---|---|---|
| **Activation bounty** | **KES 750**, once per farm | On their first paid subscription |
| **Ongoing commission** | **10%** of every payment that farm ever makes | Every time they pay, for as long as they stay |

The bounty is what makes signing a farmer worth your time. The commission is what makes it worth
keeping them happy afterwards.

### It is the same money whichever plan they choose

This is deliberate. You should never have to push a farmer onto a plan they cannot afford in order
to earn properly.

| Plan | Farmer pays | You earn in their first year |
|---|---|---|
| Monthly | 1,000 per month | **1,950** |
| Quarterly | 2,800 every 3 months | **1,870** |
| Annual | 10,000 per year | **1,750** |

Sell whatever fits the farmer's pocket. A farmer on a plan they can sustain pays you for years. A
farmer pushed onto an annual plan they cannot afford lapses in March and pays you nothing again.

### What it builds to

Commission keeps arriving as long as the farm keeps paying, so this grows even in months when you
sign nobody new.

| Active farms you have signed | Ongoing commission per month | Plus, if you sign 5 new farms that month |
|---|---|---|
| 20 | ~1,870 | +5,150 |
| 50 | ~4,670 | +5,150 |
| 100 | ~9,330 | +5,150 |

(Assumes farms on the quarterly plan. An agrovet counter holding 50 active farms and signing a
handful each month is earning around **10,000 a month** for conversations happening at the till.)

The flip side is honest: if your farms stop paying, your monthly income stops with them. That is
the point. You are paid to keep farmers succeeding with the app, not just to sign them.

---

## 3. The rules, in plain words

**The bounty is paid once per farm.** If a farmer lapses and comes back, there is no second bounty.

**On the monthly plan, the bounty is held until their second payment.** You still earn it, you just
receive it once that farmer has paid twice. Two reasons: it protects against someone signing up for
one month and vanishing, and it keeps the scheme honest for everybody. On quarterly and annual the
bounty is paid straight away, because those are months already banked.

**Free trials earn nothing.** A 30-day trial is a tool for closing a sale, not a sale. You earn when
the farmer pays.

**You earn on a farm for as long as it keeps paying.** There is no cut-off after a year. If a farmer
you signed in 2026 is still paying in 2030, you are still earning 10%.

**A farm belongs to the agent who first activated it.** Agent codes are recorded on every payment,
so this is not a matter of memory or argument.

**Nobody is charged anything to become an agent.** If someone asks you to pay a joining fee, a
training fee, or to buy stock, that is not HerdCare and you should report it.

---

## 4. How and when you are paid

- Commission is paid **by M-Pesa, monthly**, on a fixed date agreed when you join.
- You can check what you are owed at any time. You are given a key that shows your farms, your
  earnings, and what is outstanding, so you never have to ask and wait.
- Every payment to you is tied to a specific farmer payment, with the date and M-Pesa reference. If
  a number looks wrong, it can be traced to the exact transaction rather than argued about.
- Commission is income. You are an independent agent, not an employee, so you are responsible for
  your own tax. Kenya applies withholding tax to commission payments in some circumstances; the
  operator should confirm the current treatment with an accountant and tell you clearly whether
  your payments are gross or net.

---

## 5. What you are actually selling

Farmers do not buy record-keeping. They buy the things it prevents.

- **Money they are owed and have forgotten.** Most farmers sell milk or eggs on credit to
  neighbours. HerdCare keeps a running balance per customer. Recovering even one forgotten debt a
  month covers the subscription several times over. This is the easiest sale to make, because every
  farmer recognises the problem instantly.
- **A missed heat.** Miss one, and the cow is dry for weeks longer than she should be. HerdCare
  watches for the return to heat about three weeks after a service and says so. One catch is worth
  more than several years of subscription.
- **Milk that gets rejected.** Treat an animal, forget the withdrawal period, and the cooperative
  rejects the delivery. HerdCare tracks the safe date automatically.
- **A flock lost to Newcastle.** HerdCare carries the full vaccination programme by flock age and
  reminds the farmer before each one is due.
- **Knowing which animals actually pay.** Milk is recorded per animal, so the farmer can see which
  cow earns 480 a day and which earns 190. That is a real culling and feeding decision.

The strongest demonstration is not a feature tour. Ask a farmer who owes them money for milk, and
watch them try to remember.

---

## 6. Getting started as an agent

1. You receive an agent code, for example `AGT-042`, and a key for checking your earnings.
2. Give a farmer a **free 30-day trial** on the spot. It costs nothing and needs no payment.
3. Help them enter their animals. This is the step that decides whether they stay, so do not skip
   it. A farmer with an empty app will not renew.
4. Come back within the month. By then the app will have reminded them of something real, and that
   is the conversation that closes the sale.
5. They pay by M-Pesa from inside the app, and their subscription starts immediately.

---

# For whoever runs HerdCare

Everything above is what the agent sees. This part is for you.

## Recruiting

You cannot sell this alone, and you should not try to build a field sales force either.
Door-to-door does not work at these prices: an hour of travel for one farm earns an agent 1,030,
and they will stop after a week.

Recruit people who are **already a fixed point in a farmer's week**:

| Who | Why they work | How to approach |
|---|---|---|
| **Agrovet shop owners** | Dozens of farmers a week already spending on animal health. Zero travel. | Best first channel. Start here. |
| **AI technicians** | Already inside the farm, already trusted, and breeding records are their own working data. | They benefit from the data themselves, which makes the pitch easy. |
| **Vets** | High credibility, serve the larger farms that can afford annual. | Fewer and busier. Worth the effort for the credibility alone. |
| **Cooperative clerks** | See every member every single day. Monthly renewal lines up with the milk payout. | Check the cooperative's rules on staff earning commission first. |

Ten good agrovet counters will outperform fifty people walking between farms.

## Onboarding an agent

```bash
# Creates the agent and prints their key once. It is stored hashed and cannot be shown again.
curl -X POST https://<your-worker>/admin/agents \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"AGT-042","name":"Wanjiku Agrovet","phone":"0712345678"}'
```

Give them the key immediately and tell them to keep it. If it is lost, run the same command again
to issue a new one.

Rates are per agent, so you can offer a better deal to a high-volume partner without changing
anybody else's terms:

```bash
-d '{"code":"AGT-042","name":"Wanjiku Agrovet","commissionRate":0.12,"activationBounty":1000}'
```

## Paying out

```bash
# What every agent is owed
curl https://<your-worker>/agents/AGT-042/summary -H "Authorization: Bearer $ADMIN_TOKEN"

# After you have sent the M-Pesa, mark it settled
curl -X POST https://<your-worker>/admin/agents/AGT-042/settle -H "Authorization: Bearer $ADMIN_TOKEN"
```

Settle **after** the money has left your phone, not before. The settle call marks every outstanding
payment as paid and is not designed to be undone.

## What this costs you

| Plan | Farmer pays, year 1 | Agent earns | Your share |
|---|---|---|---|
| Monthly | 12,000 | 1,950 | 84% |
| Quarterly | 11,200 | 1,870 | 83% |
| Annual | 10,000 | 1,750 | 83% |

A distribution cost of roughly 17% is healthy for a channel-sold product, and it is steady across
plans by design, so your margin does not depend on what an agent happens to sell.

## Things to watch

- **An agent whose farms lapse quickly.** The held-back monthly bounty catches the worst of it, but
  a pattern of farms going quiet after one payment is worth a conversation.
- **Farms with no activity.** A farmer who has not opened the app in two weeks will not renew. That
  is the moment for the agent to visit, not the day the subscription ends.
- **Agents signing up their own family.** The bounty is larger than a month's subscription, so this
  is the obvious thing to try. The monthly holdback blocks the cheapest version of it.
- **Changing the rates.** You can, per agent, but tell them first and in writing. An agent who finds
  out their rate changed by noticing a smaller payment will tell every other agent.
