# Alamino — Devpost submission draft

Issue [#15](https://github.com/donovan-ratefison/alamino/issues/15). Ready for team review; the issue requires approval from all three contributors before it is complete.

## Project name

Alamino

## Tagline

Capture debts with AI, cancel circular obligations, and settle the remainder with PayPal.

## Inspiration

In a market, the restaurant may owe the butcher, the butcher may owe the rice seller, and the rice seller may owe the restaurant. Each person sees a separate debt in a notebook. Together, those obligations can form circles that cancel without anyone moving money.

We wanted to make that clearing process understandable and usable from a phone. Alamino connects handwritten records, agreement between traders, transparent clearing, and payment of the remaining balances.

## What it does

A trader types a sentence or photographs a notebook page. The AI proposes structured debt drafts; the trader reviews them before saving. Unknown names and ambiguous amounts need clarification. The debtor and creditor must agree before a debt can enter clearing.

The clearing house runs a deterministic engine that cancels circular obligations and calculates each trader's remaining net position. An animated network explains what changed. Traders who still owe pay in once through PayPal Checkout; traders who are owed receive a PayPal payout. Each trader can read a personal statement.

Our example uses five traders and nine confirmed debts, including the $50 debt added during the walkthrough. It starts with **$990 in obligations**, cancels **$570 without moving money**, and reduces the remaining $420 of obligations to **$320 in pay-ins**, redistributed as $320 in payouts. The cash required is 67.7% below the original gross obligations. These are demonstration figures, not measured results from a real market.

The finance workspace adds searchable AG Grid transactions and an actual AG Studio dashboard with five views, editable widgets, charts, filters and saved layouts. Its data source is explicit: the Alamino ledger, labelled demonstration fixtures, or an authorised PayPal Sandbox account.

## How we built it

Alamino uses Next.js, React, TypeScript, Tailwind CSS and SQLite. React Flow visualises the debt network, and Driver.js introduces the application and the capture screen.

**PayPal is the settlement layer.** The backend creates and captures Orders v2 for the amounts calculated by the clearing engine. It checks captures against the settlement plan and sends Payouts only after the required pay-ins are captured. Round identifiers support idempotent payout requests. Transaction Search and known order/payout references supply the Sandbox finance dashboard. The Client Secret stays on the server.

**AI handles interpretation and explanation.** A vision model receives text or notebook photos through an OpenAI-compatible Chat Completions API and returns schema-constrained JSON. The application validates drafts, and people approve debts. The model can suggest how to resolve mismatches and explain a completed round; financial calculations remain in server code using integer minor units.

**AG Studio is integrated separately from AG Grid Community.** Its native AI module, harness and client tool runner can query the authorised loaded data and edit dashboard widgets when a model and an operator session are available. The assistant has no payment execution tool. Without model access, its supported financial questions use an explicitly labelled deterministic fallback.

The VPS runs behind Nginx and HTTPS. GitHub Actions checks the application before deploying the exact validated commit, with a persistent database, online backups, health checks and rollback support.

## Challenges we ran into

Reading a notebook is only useful if users can identify mistakes and correct them. We kept drafts editable, required both parties to approve, and separated model output from the money calculations.

Clearing also needs a visible explanation: cancellation is different from a payment. We show both the original debts and the remaining positions, then follow pay-ins and payouts through their statuses.

Provider data can be delayed or incomplete. The finance dashboard identifies its source and missing fields instead of replacing failed Sandbox calls with invented transactions.

## Accomplishments that we are proud of

The prototype connects capture, agreement, clearing, settlement and statements in one working flow. Its demonstration makes a precise result visible: nine obligations can be settled with five net payment positions.

We also kept the boundaries explicit: AI proposes and explains; tested code calculates; users approve; PayPal settles.

## What we learned

Reducing the number of transfers is only part of the problem. Traders need to understand why their balance changed, who still needs to act, and whether an amount has actually been paid. Source labels, confirmation steps and clear payment statuses matter as much as the clearing algorithm.

## What's next

We want to add offline capture with a reviewable synchronisation queue for unstable connections, stronger trader identities and permissions, and production reconciliation and audit trails. Signed payment webhooks and off-server backup storage are further operational improvements. These are future work.

## Tools used

| Tool | Use |
| --- | --- |
| PayPal Checkout / Orders v2 | Trader approval, server-created orders and verified captures. |
| PayPal Payouts | Redistribution to traders with positive net positions. |
| PayPal Transaction Search | Authorised Sandbox transaction analytics, supplemented by known orders and payouts. |
| OpenAI-compatible multimodal model | Notebook/text interpretation, clarification suggestions, statements and financial assistant intents. The repository defaults to Meta AI **muse-spark-1.3**; the model/provider is configurable. |
| AG Grid Community / React | Transaction search, sorting, filters, pagination and CSV export. |
| AG Studio / React and Studio Agent Framework | Customisable reports, charts, widgets and authorised dashboard tools. |
| React Flow and Driver.js | Clearing visualisation and guided onboarding. |
| Codex | Assisted implementation, tests, deployment troubleshooting, operations scripts and documentation. |
| Image generation tool | Original Alamino branding and guide illustrations, then optimised as application assets. |
| GitHub Actions, PM2, Nginx and SQLite | Verification, deployment, process management, HTTPS proxying and persistent storage. |

## Demo access and present limits

- Public demo: **https://alamino.live-preprod.site**.
- Public source: **https://github.com/donovan-ratefison/alamino**.
- The hosted demo currently uses **simulated PayPal payments and the plain-code AI fallback**, clearly labelled in the UI. These are not real PayPal transactions or model inference.
- Real Sandbox payments, account data and model-powered capture require the documented credentials. Follow [README](../README.md), [Finance setup](FINANCE.md) and [deployment instructions](DEPLOYMENT.md). Do not publish private credentials.
- The profile selector is a demonstration feature, not per-trader authentication. AG Studio requires a suitable licence for use beyond its trial conditions. The prototype is not a production banking or escrow service.

## Team review — not part of the submission text

- [ ] All three contributors have reviewed and approved the text, as required by issue #15.
- [ ] Confirm the model/provider actually used in the credentialed demonstration matches the Tools section.
- [ ] Attach the public, under-three-minute YouTube video and show the real Sandbox/AI behaviour separately from the labelled hosted fallback.
- [ ] Check the app, repository and video links in a private browser window before submitting.
- [ ] Recheck the hosted mode labels if the operator changes the server configuration.
