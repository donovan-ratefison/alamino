# Alamino AI Finance Dashboard

Open `/finance` from **AI Finance** in the navigation. Existing capture, confirmation,
clearing and statement screens remain available.

The page shows the four KPI cards first. A line under the title shows the data
source, the period and the currency. **Settings** (closed by default) holds the data
source, the admin sign-in, the date range, the currency, **Apply period** and
**Refresh data**. Data sources:

- **Alamino ledger** (default, public): the settlements of the clearing rounds in
  this app. Each settlement is one record. A pay-in is money that the clearing
  account received from a trader; a pay-out is money paid out to a trader. The
  amount is in USD, the customer is the trader, the date is the round date.
  Status: `captured` or `confirmed` is completed, `pending` or `sent` is pending,
  `failed` is failed, `none` is not shown. Without a round in the period, the page
  shows an empty state with a link to the market page.
- **Demonstration fixtures** (public): generated `DEMO-*` records.
- **PayPal Sandbox account** (admin session): see below.

## Run locally

Requires Node >=22.13. Install using `npm ci`. On Windows, better-sqlite3 13.0.3
can invoke node-gyp despite shipping a working prebuilt binary. If installation fails
for missing Visual Studio C++ tools, `npm ci --ignore-scripts` uses the shipped binaries.
Verify with `node -e "const D=require('better-sqlite3');new D(':memory:').close()"`.

Copy `.env.example` to `.env.local` and run `npm run dev` (`npm.cmd run dev` in
PowerShell when npm.ps1 is blocked). No API key is required for the labelled demo.

## Packages and licence

AG Grid Community/React 36.3.x, AG Studio/React 3.1.0, and the Studio-managed
AG Charts Enterprise 14.3.x are aligned. Studio is loaded only on `/finance`.
The transaction explorer uses Community features, including CSV export.

AG Studio is a separate commercial product. Its evaluation watermark remains when
`NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` is absent. Without a key, Studio 3.1.0 shows a
grey AG Studio logo with the text "For Trial Use Only" at the bottom right of the
dashboard area. It fades after 3 seconds and goes away after 5 seconds, each time
Studio starts (new data source or currency). It does not show on `localhost` or
`127.0.0.1`, but it shows on any other host name or IP address. The browser
console also shows a "License Key Not Found" block. Charts inside Studio show no
separate AG Charts watermark. The page does not print a licence notice itself. Obtain a valid trial, hackathon or
commercial Studio licence before deployment. A Studio licence covers its built-in
widgets, not standalone Enterprise grid/chart use. No standalone Enterprise chart
or grid feature is required by the transaction explorer.

Official references:
- https://www.ag-grid.com/studio/react/installation/
- https://www.ag-grid.com/studio/react/compatibility/
- https://www.ag-grid.com/studio/react/enterprise-licence/
- https://www.ag-grid.com/studio/react/ai-client-tool-runner/

## Connect Sandbox and AI

Configure these locally or in the hosting service; never commit secrets:

| Variable | Purpose |
| --- | --- |
| `FINANCE_ADMIN_PASSWORD` | Separate random password, 16+ characters. Required for account data, live AI and Sandbox payment actions. |
| `PAYPAL_CLIENT_ID` | Sandbox REST app identifier, server side. |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST app secret, server side only. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same Sandbox app identifier, for the existing Checkout button. |
| `PAYPAL_BASE_URL` | Must be `https://api-m.sandbox.paypal.com` for Finance. |
| `AI_API_KEY` | Server-side key for the configured OpenAI-compatible provider. |
| `AI_BASE_URL` | Provider endpoint, default `https://api.meta.ai/v1`. |
| `AI_MODEL` | Provider model, default `muse-spark-1.3`; must support strict structured output. |
| `AI_DAILY_CALLS` | Maximum model calls per UTC day across the server process; default 300. |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | Browser licence key for Studio; this is not an API credential. |
| `DATABASE_PATH` | SQLite database location; use persistent storage for saved reports/history. |

Restart after changing server environment variables. Rebuild and redeploy after changing any `NEXT_PUBLIC_` variable, including the Checkout client ID or Studio licence. Open **Settings** on `/finance`,
sign in using **Admin sign-in**, then select **PayPal Sandbox account**. Enable the reporting scope
`https://uri.paypal.com/services/reporting/search/read` on the Sandbox app where
available, as well as Payouts for the existing settlement flow. Create the five
personal Sandbox accounts described in the project architecture. Their addresses
are configured using `PAYPAL_EMAIL_HERY`, `PAYPAL_EMAIL_SOA`, `PAYPAL_EMAIL_RIVO`,
`PAYPAL_EMAIL_LALAO`, `PAYPAL_EMAIL_FIDY` before seeding the local ledger.

The new signed session cookie is HttpOnly, SameSite=Strict, expires in eight hours
and is Secure when served over HTTPS. It is scoped to `/api`. Sandbox actions in
the existing Round screen require this session too. Demo profile selection is
still a demonstration feature, not a merchant identity system. This is a single
Sandbox-account administrative dashboard, not multi-tenant production access control.

## Data semantics

- The Alamino ledger reads the local rounds only. It never calls PayPal.
- The demonstration source uses explicitly labelled `DEMO-*` fixtures. They never enter the
  Sandbox cache. No PayPal failure silently switches to generated transactions.
- Sandbox uses `/v1/reporting/transactions`, paginated and divided into windows of
  at most 30 days. A reporting result may lag by up to three hours.
- Known Orders v2 and Payouts batches are fetched to supplement recent reporting
  records. This is bounded to 50 known orders and 20 batches. Broader history depends
  on Transaction Search. Records are reconciled by provider transaction ID.
- Missing customer names or payment methods remain explicitly unavailable.
  Unknown provider statuses remain `unknown`, rather than becoming successful payments.
- Partial provider failures and skipped malformed records are displayed as warnings.
  The dashboard shows retrieval time; it does not imply that reporting is current.
- Receipts, outgoing payments and refunds are calculated separately in integer
  minor currency units. Currencies are never added together. A net flow is not
  a PayPal account balance; account funding, fees and adjustments are not revenue.
- Revenue Analytics measures clearing receipts. Alamino does not currently record
  commission revenue, so clearing deposits are never called platform turnover.
- PayPal refund events are displayed from provider reporting; no refund-creation
  capability is added. Debt repayments and PayPal refunds are different concepts.
- Debt Tracker shows the existing USD demonstration ledger, independent of the
  transaction period. It is labelled even when Sandbox transactions are selected.
- Global date/currency filters scope the transactions. Grid filters scope the
  explorer; Studio filters scope its report. The financial assistant reports on
  the loaded transaction period/currency, not an arbitrary client-side grid filter.
- Financial questions use UTC; week comparison uses matching week-to-date periods.
  Incomplete selected periods are identified in the answer.

## Studio customisation and assistant

Five preset pages. **Financial Overview** and **Payment Monitoring** are tabs;
Revenue Analytics, Debt Tracker and Transaction Analytics are in **More views**.
The **Layout** menu holds **Customise dashboard** (Studio edit mode), **Save layout**
and **Reset layout**. Edit mode supports native Studio widgets, charts, layout
editing, filters and cross-filtering. Use **Save layout** explicitly.
Ledger and demo layouts are stored in this browser; authenticated Sandbox layouts are stored
in SQLite and scoped to the configured Sandbox client ID. **Reset layout** restores
the presets and does not reset debts or payments. Unsaved changes are not retained.

**Finance assistant** opens the native **AI** panel in Studio's edit mode. It uses `AgStudioAiModule`,
`createAiHarness` and `clientToolRunner`, not a simulated Studio substitute.
The backend interprets questions using the configured provider's strict structured output when a key and
admin session are present. It returns a restricted Studio tool request for queries
and widget edits. Studio executes its own tools against the authorised loaded data.
No payment tool is offered. Dashboard tools validate their argument schemas.

Financial totals in text answers are calculated by server code. Without an AI key
or an admin session, the assistant is explicitly a deterministic fallback answering
the supported finance questions; arbitrary dashboard editing then uses Studio UI.
Provider errors fall back with a notice. Tool results are displayed by Studio.

## Validation and limits

Run `npm test`, `npm run typecheck`, and `npm run build`. Finance tests cover monetary
precision, currency isolation, classification, report pagination, date validation,
sessions, request limits, dashboard scoping, demo provenance and financial answers.

Verify the actual Sandbox account separately: completed payment, pending status
when available, denied/failed status when available, payout, refund history and
reporting permissions. A configured key alone does not prove API access. Live-model
widget creation and the deployed Studio licence must also be checked with credentials.

No webhooks are registered: status refresh is explicit, with bounded provider calls
and short-lived complete snapshots. This avoids introducing an unverified webhook
endpoint. Server process rate limits protect login/sync/assistant routes; distributed
deployments need a shared limiter. For production, add merchant identities, restrict
the public demonstration/reset endpoints, and implement proper accounting and reconciliation.
