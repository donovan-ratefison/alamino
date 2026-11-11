import { test } from "node:test";
import assert from "node:assert/strict";
import { captureMatches, payoutStatus, payoutUpdates, toCents, toUsd, type CaptureResponse } from "./payments.ts";

test("cents convert to and from PayPal USD strings", () => {
  assert.equal(toUsd(17000), "170.00");
  assert.equal(toUsd(1005), "10.05");
  assert.equal(toCents("170.00"), 17000);
  assert.equal(toCents("10.05"), 1005);
});

const capture = (value: string, currency = "USD", status = "COMPLETED"): CaptureResponse => ({
  status,
  purchase_units: [{ payments: { captures: [{ status, amount: { currency_code: currency, value } }] } }],
});

test("a capture matches only the planned amount in USD", () => {
  assert.equal(captureMatches(capture("170.00"), 17000), true);
  assert.equal(captureMatches(capture("169.99"), 17000), false);
  assert.equal(captureMatches(capture("170.00", "EUR"), 17000), false);
  assert.equal(captureMatches(capture("170.00", "USD", "PENDING"), 17000), false);
  assert.equal(captureMatches({ status: "COMPLETED" }, 17000), false);
});

test("payout item status maps to settlement status", () => {
  assert.equal(payoutStatus("SUCCESS"), "confirmed");
  for (const s of ["FAILED", "RETURNED", "BLOCKED", "DENIED"]) assert.equal(payoutStatus(s), "failed");
  for (const s of ["PENDING", "UNCLAIMED", "ONHOLD"]) assert.equal(payoutStatus(s), "sent");
});

test("payout batch items become settlement updates", () => {
  assert.deepEqual(
    payoutUpdates([
      { payout_item_id: "I1", transaction_status: "SUCCESS", payout_item: { sender_item_id: "hery" } },
      { payout_item_id: "I2", transaction_status: "DENIED", payout_item: { sender_item_id: "rivo" } },
    ]),
    [
      { traderId: "hery", status: "confirmed", paypalPayoutItemId: "I1" },
      { traderId: "rivo", status: "failed", paypalPayoutItemId: "I2" },
    ],
  );
});
