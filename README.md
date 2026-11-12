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

## AI

The app calls a vision language model through the OpenAI Chat Completions format.
Any OpenAI-compatible provider works: set `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`. The model must support images and strict structured output.
Each call asks for structured output with a strict JSON schema. Notebook photos go to the model as images.
The AI never computes an amount.

## Checks

```
npm test
npm run typecheck
npm run lint
```

## End-to-end tests

```
npm run e2e
```

Playwright plays the user journeys in Chrome on a production build: add a debt, confirm, dispute, run clearing, settle, read the statement, phone width. It uses no keys (PayPal simulated, AI fallback) and its own database, so it moves no money and makes no AI call.

The issue walks live in `e2e/issue-*.spec.ts` (`npm run test:e2e:issues`). They replay the real user path with a screenshot per step; open `npm run test:e2e:ui` to watch a walk visually in the Playwright UI. Issue #8 (`e2e/issue-8-demo-path-phone-laptop.spec.ts`) walks every screen on a phone and on a laptop and audits each screen for misplaced UI.

## Docs

- [Automatic VPS deployment, SSH secrets and rollback](docs/DEPLOYMENT.md)
- [First-visit tour, illustrated guides and navigation](docs/ONBOARDING.md)
- [AI Finance Dashboard: setup, Sandbox, AG Studio and validation](docs/FINANCE.md)

- [Architecture](docs/ARCHITECTURE.md)
- [Overall flow diagram](docs/clearing-house-system.md)
- [User journeys, sequence diagrams](docs/user-journeys.md)

## Licence

Apache 2.0. See [LICENSE](LICENSE).
