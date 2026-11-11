// Demo data, see docs/ARCHITECTURE.md section 11. Money is integer cents, USD.
// The ninth debt (rivo -> hery 5000) is not here: it is added live in the demo.

import { db, insertDebt, insertTrader, newId } from "./db.ts";
import type { Trader } from "./types.ts";

const email = (id: string) => process.env[`PAYPAL_EMAIL_${id.toUpperCase()}`] ?? `${id}@alamino.example`;

const TRADERS: Omit<Trader, "paypalEmail">[] = [
  { id: "hery", name: "Hery", business: "Rice wholesale", aliases: ["Hery vary", "the rice seller", "mpivarotra vary"] },
  { id: "soa", name: "Soa", business: "Restaurant", aliases: ["Soa hotely", "the restaurant", "Madame Soa"] },
  { id: "rivo", name: "Rivo", business: "Butcher", aliases: ["Rivo hena", "the butcher", "le boucher"] },
  { id: "lalao", name: "Lalao", business: "Vegetables", aliases: ["Lalao legioma", "the vegetable seller", "la marchande de legumes"] },
  { id: "fidy", name: "Fidy", business: "Delivery", aliases: ["Fidy moto", "the delivery man", "le livreur"] },
];

// [debtor, creditor, cents, note]
const DEBTS: [string, string, number, string][] = [
  ["soa", "hery", 30000, "rice for the restaurant, week 45"],
  ["hery", "fidy", 12000, "rice deliveries to the shops, two weeks"],
  ["fidy", "soa", 9000, "lunches for the delivery team"],
  ["lalao", "soa", 15000, "catering for the vegetable stall staff"],
  ["soa", "rivo", 11000, "zebu meat for the weekend menu"],
  ["rivo", "lalao", 7000, "onions and tomatoes for the butcher shop"],
  ["fidy", "rivo", 4000, "meat for a family event"],
  ["lalao", "hery", 6000, "two bags of rice"],
];

const DAY = 24 * 60 * 60 * 1000;

export function seed(): void {
  db().transaction(() => {
    for (const t of TRADERS) insertTrader({ ...t, paypalEmail: email(t.id) });
    const now = Date.now();
    DEBTS.forEach(([debtorId, creditorId, cents, note], i) => {
      insertDebt({
        id: newId("d"),
        debtorId,
        creditorId,
        amountCents: cents,
        remainingCents: cents,
        note,
        source: "seed",
        status: "confirmed",
        debtorOk: true,
        creditorOk: true,
        // Oldest first, about half a day apart, ending yesterday.
        createdAt: new Date(now - DAY - (DEBTS.length - 1 - i) * (DAY / 2)).toISOString(),
      });
    });
  })();
}

export function reset(): void {
  db().transaction(() => {
    db().exec("DELETE FROM settlements; DELETE FROM rounds; DELETE FROM debts; DELETE FROM traders;");
    seed();
  })();
}
