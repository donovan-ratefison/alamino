# Alamino: overall flow

```mermaid
flowchart TD
    subgraph Traders["Traders in one market"]
        T["Hery, Soa, Rivo, Lalao, Fidy"]
    end

    subgraph App["Web app (Next.js)"]
        ADD["/add<br/>sentence or notebook photo"]
        CONF["/confirm<br/>debtor and creditor approve"]
        MARKET["/ market view<br/>debt network, ledger, Run clearing"]
        ROUND["/rounds/id<br/>before and after, circles, payments"]
        STMT["/statement<br/>what cancelled, what is left, why"]
    end

    subgraph AI["AI layer (src/lib/ai), never touches amounts"]
        CAP["captureDebts<br/>messy input to draft debts,<br/>matches names to traders"]
        FIX["resolveMismatch<br/>suggests a fix when amounts differ"]
        EXPL["explainRound<br/>plain-language statement"]
    end

    subgraph Core["Core engine (plain code)"]
        LEDGER[("Debt ledger<br/>SQLite")]
        NET["Stage 1: cancel circles<br/>no money moves"]
        POS["Stage 2: net positions<br/>pay-ins and pay-outs"]
    end

    subgraph PP["PayPal sandbox"]
        ORD["Orders v2<br/>pay-in to the clearing account"]
        PAY["Payouts<br/>one batch, one item per creditor"]
    end

    T -- "1. Add" --> ADD
    ADD --> CAP
    CAP -- "drafts, saved only on a click" --> LEDGER
    LEDGER -- "proposed" --> CONF
    CONF -- "amounts differ" --> FIX
    FIX -- "suggestion" --> CONF
    CONF -- "2. Confirm: both approve" --> LEDGER

    MARKET -- "3. Clear" --> NET
    LEDGER -- "confirmed debts" --> NET
    NET -- "$570 cancelled" --> POS
    POS --> ROUND

    ROUND -- "4. Settle: net debtors pay $320" --> ORD
    ORD -- "all pay-ins captured" --> PAY
    PAY -- "payouts confirmed: debts settled" --> LEDGER

    POS --> EXPL
    EXPL -- "5. Explain" --> STMT
    STMT --> T
```

## How to read it

- **Five steps.** Add, confirm, clear, settle, explain. The numbers on the arrows follow `ARCHITECTURE.md`, section 1.
- **Money decisions stay in plain code.** The AI reads messy input, suggests and explains. The ledger, the netting and the settlement plan are deterministic.
- **Cash moves once.** Circles cancel $570 of the $990 with no money. Net debtors pay $320 into the clearing account (Orders v2). The clearing account pays the net creditors (Payouts).
- **No payout before all pay-ins are captured.** Capture and payout are idempotent.
- **Without keys the demo still runs.** PayPal runs in simulated mode and the AI uses a plain-code fallback. The UI labels both.
