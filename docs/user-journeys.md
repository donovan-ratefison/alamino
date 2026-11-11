# User journeys

Sequence diagrams of the six user journeys. The amounts are those of the demo data (`ARCHITECTURE.md`, section 11). The automated tests in `e2e/` follow the same journeys.

Participants:

- **Trader**: the person in front of the screen. The "View as" select in the header chooses which trader.
- **Screen**: the page in the browser.
- **API**: the Next.js route handlers.
- **AI**: the model behind `src/lib/ai`. It never computes or changes an amount.
- **Ledger**: the SQLite database and the netting engine (plain code).
- **PayPal**: the sandbox. Without keys, the API simulates it and the screen says so.

## 1. Add a debt

A trader types a sentence or takes a photo of a notebook page. Nothing is saved before the trader clicks Save.

```mermaid
sequenceDiagram
    actor Rivo as Trader (Rivo)
    participant Screen as Screen /add
    participant API
    participant AI
    participant Ledger

    Rivo->>Screen: Types "I owe Hery 50 for rice" or takes a photo
    Note over Screen: A photo is reduced to 1600 px before it is sent
    Screen->>API: POST /api/capture (text or image, createdBy rivo)
    API->>Ledger: Read the traders and their aliases
    API->>AI: Sentence or image, trader list, who is speaking
    AI-->>API: Draft debts as JSON
    API->>API: Check ids, amounts and confidence in plain code
    API-->>Screen: Drafts (nothing saved)
    Screen-->>Rivo: Editable cards: debtor, creditor, amount, note
    opt The AI could not match a name or an amount
        Screen-->>Rivo: Shows the AI question, Save stays disabled
        Rivo->>Screen: Chooses the trader or types the amount
    end
    Rivo->>Screen: Clicks Save
    Screen->>API: POST /api/debts (rivo owes hery 5000 cents)
    API->>Ledger: Insert the debt as proposed, Rivo's side approved
    API-->>Screen: The new debt
    Screen-->>Rivo: Saved. Hery must confirm
```

## 2. Confirm a debt

The other side approves, or gives a different amount. The AI can suggest a way out of a dispute, but both sides must still approve.

```mermaid
sequenceDiagram
    actor Hery as Trader (Hery)
    actor Rivo as Trader (Rivo)
    participant Screen as Screen /confirm
    participant API
    participant AI
    participant Ledger

    Hery->>Screen: Opens Confirm
    Screen->>API: GET /api/debts
    API-->>Screen: Debts, the proposed one is waiting for Hery
    alt Hery agrees
        Hery->>Screen: Clicks Approve
        Screen->>API: POST /api/debts/:id/confirm (hery, ok true)
        API->>Ledger: Both sides approved: status confirmed
        API-->>Screen: Debt confirmed
    else Hery gives a different amount
        Hery->>Screen: Types 60 and sends it
        Screen->>API: POST /api/debts/:id/confirm (hery, ok false, counter 6000)
        API->>Ledger: Status disputed, counter amount stored
        API-->>Screen: Debt disputed
        opt A trader asks the AI
            Rivo->>Screen: Clicks Ask the AI
            Screen->>API: POST /api/debts/:id/resolve
            API->>AI: The debt, both amounts, both notes
            AI-->>API: A suggestion, and one of the two amounts or none
            API-->>Screen: Suggestion (not applied)
        end
        Rivo->>Screen: Clicks Accept $60
        Screen->>API: POST /api/debts/:id/confirm (rivo, ok true, counter 6000)
        API->>Ledger: Amount set to 6000, status confirmed
        API-->>Screen: Debt confirmed
    end
```

## 3. Run clearing

The engine cancels the circles, then works out who pays in and who is paid out. No money moves in this journey.

```mermaid
sequenceDiagram
    actor Trader
    participant Screen as Screen / and /rounds/id
    participant API
    participant Ledger as Ledger and netting engine

    Trader->>Screen: Clicks Run clearing on the market view
    Screen->>API: POST /api/rounds
    API->>Ledger: Read all confirmed debts ($990)
    Ledger->>Ledger: Stage 1: find circles, cancel the smallest amount on each ($570)
    Ledger->>Ledger: Stage 2: net position of each trader ($320 to move)
    Ledger->>Ledger: Reduce each debt, oldest first. Zero left: cleared
    Ledger-->>API: Round with pay-ins, pay-outs and debt changes
    alt No confirmed debt, or a round is still open
        API-->>Screen: 409 with the reason
        Screen-->>Trader: Shows the reason
    else Round created
        API-->>Screen: The round
        Screen-->>Trader: Before and after networks, circles cancelled
        Screen-->>Trader: Plan: Soa $170, Lalao $140, Fidy $10 pay in. Hery $290, Rivo $30 are paid out
    end
```

## 4. Settle through PayPal

Each trader who owes pays in to the clearing account. When every pay-in is captured, the clearing account pays the traders who are owed.

```mermaid
sequenceDiagram
    actor Soa as Trader who owes (Soa)
    actor Any as Any trader
    participant Screen as Screen /rounds/id
    participant API
    participant Ledger
    participant PayPal

    loop For Soa, Lalao and Fidy
        Soa->>Screen: Clicks the PayPal button on the own row
        Screen->>API: POST /api/rounds/:id/payin/soa/order
        API->>Ledger: Read the amount from the round (never from the browser)
        API->>PayPal: Create order, $170, custom_id round:soa
        PayPal-->>API: Order id
        API->>Ledger: Settlement pending
        API-->>Screen: Order id
        Soa->>PayPal: Approves in the PayPal window
        Screen->>API: POST /api/rounds/:id/payin/soa/capture (order id)
        API->>PayPal: Capture the order
        PayPal-->>API: Captured amount and currency
        alt Amount and currency equal the plan
            API->>Ledger: Settlement captured, round collecting
        else They differ
            API->>Ledger: Settlement failed
            API-->>Screen: 409
        end
        API-->>Screen: The settlement
    end

    Note over Screen: Send payouts is offered only when every pay-in is captured
    Any->>Screen: Clicks Send payouts
    Screen->>API: POST /api/rounds/:id/payout
    API->>PayPal: One payout batch, sender_batch_id is the round id
    PayPal-->>API: Batch id
    API->>Ledger: Pay-outs sent, round paying
    API-->>Screen: The round

    loop Every 3 seconds until the round is done
        Screen->>API: POST /api/rounds/:id/payout/refresh
        API->>PayPal: Read the batch
        PayPal-->>API: Status of each item
        API->>Ledger: Update each pay-out
        opt Every pay-out is confirmed
            API->>Ledger: Remaining debts settled, round done
        end
        API-->>Screen: The round
    end
    Screen-->>Any: Round done. Link to the statement
```

## 5. Read the statement

Each trader reads what cancelled, what is left and why. The amounts come from the engine. The AI writes only the sentences.

```mermaid
sequenceDiagram
    actor Soa as Trader (Soa)
    participant Screen as Screen /statement
    participant API
    participant Ledger
    participant AI

    Soa->>Screen: Opens Statement
    Screen->>API: GET /api/rounds/latest/statement/soa
    alt No round yet
        API-->>Screen: 404
        Screen-->>Soa: Empty state with a link to the market
    else A round exists
        API->>Ledger: Read the round and Soa's debts
        API->>API: Build the lines, the net amount and the action in plain code
        alt First request for this round and trader
            API->>AI: The numbers, as context
            AI-->>API: A summary and one reason for each line
            API->>API: Reject the text if it has an amount that is not in the statement
            API->>API: Keep the statement in the cache
        else Already in the cache
            API->>API: Read the cache
        end
        API-->>Screen: The statement
        Screen-->>Soa: Summary, "You pay in $170", one line for each debt
    end
```

## 6. Reset the demo

```mermaid
sequenceDiagram
    actor Trader
    participant Screen as Screen /
    participant API
    participant Ledger

    Trader->>Screen: Clicks Reset demo
    Screen->>API: POST /api/demo/reset
    API->>Ledger: Delete all rows, then seed five traders and eight confirmed debts
    API-->>Screen: ok
    Screen->>API: GET /api/debts
    API-->>Screen: Eight debts, $940
    Screen-->>Trader: Market view in its first state
```
