// Orders v2 (pay-in) and Payouts (pay-out). Server only.
// The amounts always come from the round on the server, never from the browser.
import type { PaymentStatus, TraderId } from "../types.ts";
import { paypalFetch } from "./client.ts";

export const toUsd = (cents: number): string => (cents / 100).toFixed(2);
export const toCents = (usd: string): number => Math.round(Number(usd) * 100);

// ---- Orders v2 ----

export async function createOrder(roundId: string, traderId: TraderId, amountCents: number): Promise<string> {
  const order = await paypalFetch<{ id: string }>("/v2/checkout/orders", {
    method: "POST",
    // Same request id for the same pay-in: a retry returns the same order.
    headers: { "PayPal-Request-Id": `order-${roundId}-${traderId}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        { custom_id: `${roundId}:${traderId}`, amount: { currency_code: "USD", value: toUsd(amountCents) } },
      ],
    }),
  });
  return order.id;
}

export interface CaptureResponse {
  status: string;
  purchase_units?: {
    payments?: { captures?: { status: string; amount: { currency_code: string; value: string } }[] };
  }[];
}

// PayPal refuses a second capture of the same order (ORDER_ALREADY_CAPTURED), so money cannot move twice.
export const captureOrder = (orderId: string) =>
  paypalFetch<CaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Prefer: "return=representation" }, // full body, with the captured amount
  });

// True only when PayPal captured exactly the planned amount in USD.
export function captureMatches(res: CaptureResponse, planCents: number): boolean {
  const cap = res.purchase_units?.[0]?.payments?.captures?.[0];
  return (
    res.status === "COMPLETED" &&
    cap?.status === "COMPLETED" &&
    cap.amount.currency_code === "USD" &&
    toCents(cap.amount.value) === planCents
  );
}

// ---- Payouts ----

export interface PayoutItemInput {
  traderId: TraderId;
  email: string;
  amountCents: number;
}

export async function createPayoutBatch(roundId: string, items: PayoutItemInput[]): Promise<string> {
  const res = await paypalFetch<{ batch_header: { payout_batch_id: string } }>("/v1/payments/payouts", {
    method: "POST",
    body: JSON.stringify({
      // PayPal rejects a second batch with the same sender_batch_id, so a retry cannot pay twice.
      sender_batch_header: {
        sender_batch_id: roundId,
        email_subject: "Alamino clearing payout",
        email_message: "You received the net amount of your Alamino clearing round.",
      },
      items: items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.email,
        sender_item_id: i.traderId,
        amount: { currency: "USD", value: toUsd(i.amountCents) },
        note: `Alamino round ${roundId}`,
      })),
    }),
  });
  return res.batch_header.payout_batch_id;
}

export interface PayoutBatchItem {
  payout_item_id: string;
  transaction_status: string;
  payout_item: { sender_item_id: string };
}

export const getPayoutBatch = (batchId: string) =>
  paypalFetch<{ items?: PayoutBatchItem[] }>(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);

const FAILED = ["FAILED", "RETURNED", "BLOCKED", "DENIED"];

// SUCCESS is final. The failure states are final. Other states (PENDING, UNCLAIMED, ONHOLD) stay `sent`.
export function payoutStatus(transactionStatus: string): PaymentStatus {
  if (transactionStatus === "SUCCESS") return "confirmed";
  return FAILED.includes(transactionStatus) ? "failed" : "sent";
}

export const payoutUpdates = (items: PayoutBatchItem[]) =>
  items.map((i) => ({
    traderId: i.payout_item.sender_item_id,
    status: payoutStatus(i.transaction_status),
    paypalPayoutItemId: i.payout_item_id,
  }));
