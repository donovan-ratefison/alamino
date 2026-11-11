# Architecture

A clearing house for small traders in one market. Traders record what they owe each other, the app cancels the debts that form circles, and PayPal settles what is left.

Deadline: Thursday 12 November, 23:00 Antananarivo time (12:00 PST).

## 1. The product in one flow

1. **Add.** A trader types a sentence or photographs a notebook page. The AI turns it into a draft debt.
2. **Confirm.** Debtor and creditor both approve. If their amounts differ, the AI asks and proposes a fix.
3. **Clear.** The engine cancels circles (no money moves), then works out each trader's net position.
4. **Settle.** Traders who still owe pay into the clearing account through PayPal Checkout. When all pay-ins are captured, the app pays the traders who are owed through PayPal Payouts.
5. **Explain.** Each trader gets a plain-language statement of what cancelled, what is left and why.

## 2. Principles

- **Money math is plain code.** The AI never computes or changes an amount. It reads messy input, asks questions and explains results.
- **Contract first.** `src/lib/types.ts` is the shared contract. Each module builds against it and against the API table in section 7.
- **Runs without keys.** With no PayPal keys, payments are simulated. With no AI key, the AI functions use a plain-code fallback. The UI labels both.
- **Build the demo.** One market, five seeded traders, no sign-up. A "view as" switcher in the header picks the current trader.
- **Integer cents, USD.** PayPal does not support MGA.

## 3. Stack

| Piece | Choice |
|---|---|
| App | Next.js (App Router), TypeScript |
| Database | SQLite via `better-sqlite3`, reseeded on start and by the reset button |
| AI | One multimodal model, called only from `src/lib/ai/` |
| PayPal | Orders v2 (pay-in) and Payouts (pay-out), sandbox |
| Debt network view | React Flow |
| Ledger table | AG Grid |
| Hosting | Render, one web service |

## 4. Folder structure

```
src/
  lib/
    types.ts            shared contract
    netting.ts          netting engine
    netting.test.ts
    db.ts               SQLite access
    seed.ts             five traders, nine debts
    rounds.ts           run a round, apply it
    paypal/             client, orders, payouts
    ai/                 capture, resolve, explain
  app/
    api/
      traders/ debts/ rounds/ demo/
      rounds/[id]/payin/ rounds/[id]/payout/
      capture/ debts/[id]/resolve/ statement/
    page.tsx            market view
    add/                add a debt
    confirm/            confirm inbox
    rounds/[id]/        clearing result and pay
    statement/          personal statement
  components/
docs/
```

## 5. Data model

Full definitions are in `src/lib/types.ts`.

| Table | Key fields |
|---|---|
| `traders` | id, name, business, aliases, paypalEmail |
| `debts` | id, debtorId, creditorId, amountCents, remainingCents, note, source, status, debtorOk, creditorOk, counterAmountCents |
| `rounds` | id, status, debtsBefore (JSON), result (JSON), debtChanges (JSON) |
| `settlements` | roundId, traderId, direction, amountCents, status, paypalOrderId, paypalPayoutItemId |

Debt status: `proposed` → `confirmed` → `cleared` or `settled`. Side paths: `disputed` (amounts differ) and `deferred` (rolled to the next round).

## 6. Netting engine

`clear(debts: Edge[]): ClearingResult` in `src/lib/netting.ts`. It is pure and already tested.

- **Stage 1, circles.** Find a circle, remove its smallest amount from every debt on it, repeat until no circle is left. These cancellations are final and involve no money.
- **Stage 2, net positions.** For what remains, each trader's position is what they are owed minus what they owe. Negative positions pay in. Positive positions are paid out.

Stage 2 means a trader in the middle of a chain pays nothing: if A owes B 100 and B owes C 100, A pays in 100 and C receives 100.

Run the tests with `node --test --experimental-strip-types src/lib/netting.test.ts`.

### Server helpers

The PayPal and AI modules import these and do not write SQL.

`src/lib/db.ts`:

```ts
listTraders(): Trader[]
listDebts(status?: DebtStatus): Debt[]
getDebt(id: string): Debt | undefined
getRound(id: string): Round | undefined
latestRound(): Round | undefined
updateSettlement(roundId: string, traderId: TraderId, patch: Partial<Settlement>): Round  // also moves the round to `collecting` when a pay-in is captured
setRoundStatus(roundId: string, status: RoundStatus): Round
```

`src/lib/rounds.ts`:

```ts
runRound(): Round            // clear() on confirmed debts, stores round, settlements and debtChanges
finishRound(roundId): Round  // all payouts confirmed: debts `settled`, round `done`
```

## 7. API contract

All routes return JSON. Errors return `{ error: string }` with a 4xx or 5xx status.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/traders` | | `Trader[]` |
| `GET /api/debts?status=` | | `Debt[]` |
| `POST /api/debts` | `{ debtorId, creditorId, amountCents, note, source, createdBy }` | `Debt` (creator's side is pre-approved) |
| `POST /api/debts/:id/confirm` | `{ traderId, ok, counterAmountCents? }` | `Debt` |
| `POST /api/rounds` | | `Round` (runs netting on all confirmed debts) |
| `GET /api/rounds/:id` | | `Round` (`:id` may be `latest`) |
| `GET /api/config` | | `{ paypalMode: "sandbox" or "simulated", aiMode: "model" or "fallback" }` |
| `POST /api/demo/reset` | | `{ ok: true }` |
| `POST /api/capture` | `{ text?, imageBase64?, mediaType?, createdBy }` | `{ drafts: DebtDraft[], engine: "model" or "fallback" }` (nothing saved) |
| `POST /api/debts/:id/resolve` | | `{ suggestion: string, proposedAmountCents: number or null }` |
| `GET /api/rounds/:id/statement/:traderId` | | `Statement` |
| `POST /api/rounds/:id/payin/:traderId/order` | | `{ orderId }` |
| `POST /api/rounds/:id/payin/:traderId/capture` | `{ orderId }` | `Settlement` |
| `POST /api/rounds/:id/payout` | | `Round` (only when every pay-in is captured) |
| `POST /api/rounds/:id/payout/refresh` | | `Round` (polls PayPal for payout status) |

### Confirm rules (`POST /api/debts/:id/confirm`)

Only for a debt that is `proposed` or `disputed` (else 409). `traderId` must be the debtor or the creditor (else 400).

| Body | Effect |
|---|---|
| `{ traderId, ok: true }` | That side approves the current amount. Both sides approved: `confirmed`, counter fields cleared. |
| `{ traderId, ok: false, counterAmountCents: N }` | `disputed`. Stores `counterAmountCents = N`, `counterBy = traderId`. That side's approval is removed. |
| `{ traderId, ok: true, counterAmountCents: N }` | That side accepts amount N: `amountCents = remainingCents = N`, counter fields cleared. The other side counts as approved only if it is `counterBy` and N is its stored counter amount. Both approved: `confirmed`. Else `proposed`. |

### Round rules

- `POST /api/rounds` returns 409 when no debt is `confirmed`, or when a round exists that is not `done`.
- Round ids and debt ids are unique across resets (PayPal `sender_batch_id` must not repeat).
- Pay-in settlement: `none` → `pending` (order created) → `captured`. Pay-out settlement: `none` → `sent` → `confirmed` or `failed`.
- Round: `cleared` → `collecting` (first pay-in captured) → `paying` (payouts sent) → `done`. A round with no pay-in is `done` at once.

## 8. PayPal flow

One sandbox business account is the clearing account. Each trader has a sandbox personal account.

**Pay-in (Orders v2)**
1. The trader clicks the PayPal button on the round page.
2. The server creates an order for exactly that trader's pay-in amount, with `custom_id = roundId:traderId`.
3. The trader approves in the PayPal popup.
4. The server captures the order, checks the captured amount equals the plan, and marks the settlement `captured`.

**Pay-out (Payouts)**
1. When every pay-in is `captured`, the server sends one payout batch with one item per trader who is owed.
2. `sender_batch_id = roundId`, so a retry cannot pay twice.
3. The server polls the batch until items are confirmed, then marks debts `settled` and the round `done`.

**Rules**
- Never trust an amount from the browser. The server reads it from the round.
- Capture and payout are idempotent: repeating a call must not move money twice.
- No payout before all pay-ins are captured.

**Shortfall.** If a trader cannot pay in, the round goes to `shortfall`. The circles already cancelled stay cancelled. That trader's remaining debts are marked `deferred`, and positions are recalculated for the others. This is a stretch task.

## 9. AI layer

Three functions in `src/lib/ai/`, each returning JSON that is validated before use.

| Function | Input | Output | Guard |
|---|---|---|---|
| `captureDebts` | text or image, trader list with aliases, who is speaking | `DebtDraft[]` | Unknown trader or amount returns `null` plus a `question`. Nothing is saved without a user click. |
| `resolveMismatch` | the debt, both claimed amounts, both notes | a suggestion and a proposed amount | The proposal is only a suggestion. Both sides must still approve. |
| `explainRound` | one trader's debts before and after, cancellations, net position | `Statement` | Amounts come from the engine. The AI writes only `summary` and `reason`. |

The AI is given the trader list so it can match "Rakoto at the rice stall" to a trader id.

## 10. Screens

| Route | Shows |
|---|---|
| `/` | Debt network (React Flow), ledger (AG Grid), headline numbers, "Run clearing" button, reset button |
| `/add` | Text box and photo upload, AI drafts as editable cards, save |
| `/confirm` | Debts waiting for the current trader, approve or give a different amount, AI suggestion on disputes |
| `/rounds/[id]` | Before and after network, list of circles cancelled, pay-in buttons, payout status |
| `/statement` | The current trader's statement for the latest round |

## 11. Demo data

Five traders: Hery (rice), Soa (restaurant), Rivo (butcher), Lalao (vegetables), Fidy (delivery).

Nine debts in USD. The seed holds the first eight as `confirmed`. The ninth (Rivo→Hery 50) is added live in the demo: Soa→Hery 300, Hery→Fidy 120, Fidy→Soa 90, Lalao→Soa 150, Soa→Rivo 110, Rivo→Lalao 70, Fidy→Rivo 40, Lalao→Hery 60, Rivo→Hery 50.

Result from the engine:

| | Amount |
|---|---|
| Total debts | $990 |
| Cancelled by circles, no money moved | $570 |
| Paid through PayPal | $320 |
| Cash saved | 67.7% |

Pay-ins: Soa $170, Lalao $140, Fidy $10. Pay-outs: Hery $290, Rivo $30.

Demo path: view as Rivo, add "I owe Hery 50 for rice" on `/add`, view as Hery, approve on `/confirm`, run clearing.

## 12. Environment variables

```
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
AI_API_KEY=
AI_MODEL=
DATABASE_PATH=./data/app.db
```

Commit `.env.example` only. Never commit real keys: the repo is public.

## 13. Things still to verify in the sandbox

- Payouts work from the sandbox business account once pay-ins have funded it.
- Sandbox personal accounts have enough balance for the pay-ins.
- Payout status can be polled quickly enough for a live demo. If not, show `sent` as the final state in the video.
