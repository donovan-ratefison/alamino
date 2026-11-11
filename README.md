# Alamino

Malagasy banks net their debts through BFM. Market traders can't. Alamino brings clearing to the market: $990 of debt settled with $320, thanks to AI and PayPal.

## What it does

1. **Add.** A trader types a sentence or photographs a notebook page. The AI turns it into a draft debt.
2. **Confirm.** Debtor and creditor both approve.
3. **Clear.** The engine cancels the debts that form circles. No money moves.
4. **Settle.** Traders who still owe pay in through PayPal Checkout. PayPal Payouts pays the traders who are owed.
5. **Explain.** Each trader gets a plain-language statement.

The AI never computes or changes an amount. Money math is plain, tested code.

## Run it

```
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The app seeds five traders and their debts on first start. Node 22.13 or later.

Without PayPal keys, payments run in simulated mode. Without an AI key, capture and statements use a plain-code fallback. The UI labels both.

## Checks

```
npm test
npm run typecheck
npm run lint
```

## Docs

- [AI Finance Dashboard: setup, Sandbox, AG Studio and validation](docs/FINANCE.md)

- [Architecture](docs/ARCHITECTURE.md)
- [Overall flow diagram](docs/clearing-house-system.md)

## Licence

Apache 2.0. See [LICENSE](LICENSE).
