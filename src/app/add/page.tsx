"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Debt, DebtDraft, DebtSource } from "@/lib/types";
import { api, formatUsd, toCents } from "@/components/api";
import { useApp } from "@/components/app";
import { Badge, btn, Card, ErrorNote, field, label, PageHeader } from "@/components/ui";
import { Workflow } from "@/components/workflow";

interface Draft {
  debtorId: string;
  creditorId: string;
  amount: string; // dollars, as typed
  note: string;
  confidence: DebtDraft["confidence"];
  question?: string;
  source: DebtSource;
  saving?: boolean;
  saved?: Debt;
  error?: Error;
}

const confidenceTone = { high: "green", medium: "amber", low: "red" } as const;

// Phone photos are 3 to 10 MB. The capture route accepts 5 MB of base64.
// Downscale to 1600 px on the long side: enough to read handwriting.
async function readImage(file: File): Promise<{ imageBase64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { imageBase64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "", mediaType: "image/jpeg" };
}

export default function AddPage() {
  const { traders, traderId, name, refreshPending } = useApp();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [engine, setEngine] = useState<"model" | "fallback" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const update = (i: number, patch: Partial<Draft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function read(e: FormEvent) {
    e.preventDefault();
    setReading(true);
    setError(null);
    try {
      const image = photo ? await readImage(photo) : {};
      const res = await api<{ drafts: DebtDraft[]; engine: "model" | "fallback" }>("/api/capture", {
        ...(text.trim() ? { text: text.trim() } : {}),
        ...image,
        createdBy: traderId,
      });
      setEngine(res.engine);
      setDrafts(
        res.drafts.map((d) => ({
          debtorId: d.debtorId ?? "",
          creditorId: d.creditorId ?? "",
          amount: d.amountCents === null ? "" : String(d.amountCents / 100),
          note: d.note,
          confidence: d.confidence,
          question: d.question,
          source: photo ? "photo" : "text",
        })),
      );
    } catch (e) {
      setError(e as Error);
    }
    setReading(false);
  }

  async function save(i: number) {
    const d = drafts[i];
    update(i, { saving: true, error: undefined });
    try {
      const saved = await api<Debt>("/api/debts", {
        debtorId: d.debtorId,
        creditorId: d.creditorId,
        amountCents: toCents(d.amount),
        note: d.note.trim(),
        source: d.source,
        createdBy: traderId,
      });
      update(i, { saving: false, saved });
      refreshPending();
    } catch (e) {
      update(i, { saving: false, error: e as Error });
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Add a debt">
        Type a sentence or take a photo of a notebook page. The AI makes a draft. Nothing is saved until you click Save. You add debts as{" "}
        <span className="font-medium text-zinc-900">{name(traderId)}</span>.
      </PageHeader>
      <Workflow current={0} />

      <Card title="Your debt, in your words.">
        <form onSubmit={read} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="capture-text" className={label}>
              Text
            </label>
            <textarea
              id="capture-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="I owe Hery 50 for rice"
              className={`${field} h-auto py-2`}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="capture-photo" className={label}>
              Photo (optional)
            </label>
            <input
              id="capture-photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-700 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-zinc-200 file:bg-brand-soft file:px-5 file:text-sm file:font-medium file:text-brand"
            />
          </div>
          <button type="submit" className={btn.primary} disabled={reading || (!text.trim() && !photo)}>
            {reading ? "Reading..." : "Read with AI"}
          </button>
          {error && <ErrorNote error={error} />}
        </form>
      </Card>

      {engine && drafts.length === 0 && <p className="text-sm text-zinc-600">The AI found no debt. Write the sentence again with a name and an amount.</p>}

      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Drafts</h2>
            {engine === "fallback" && <Badge>Read by AI fallback</Badge>}
          </div>
          {drafts.map((d, i) => {
            const cents = toCents(d.amount);
            const valid = d.debtorId && d.creditorId && d.debtorId !== d.creditorId && cents !== null;
            const mine = d.debtorId === traderId || d.creditorId === traderId;
            if (d.saved) {
              return (
                <Card key={i}>
                  <p className="text-sm text-zinc-900">
                    Saved: {name(d.saved.debtorId)} owes {name(d.saved.creditorId)} {formatUsd(d.saved.amountCents)}. The other side must
                    confirm it.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/" className={btn.small}>
                      Go to the market
                    </Link>
                    <Link href="/confirm" className={btn.small}>
                      Go to Confirm
                    </Link>
                  </div>
                </Card>
              );
            }
            return (
              <Card
                key={i}
                title={`Draft ${i + 1}`}
                actions={<Badge tone={confidenceTone[d.confidence]}>{d.confidence} confidence</Badge>}
              >
                <div className="space-y-4">
                  {d.question && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">AI question: {d.question}</p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(["debtorId", "creditorId"] as const).map((key) => (
                      <div key={key} className="space-y-1.5">
                        <label htmlFor={`${key}-${i}`} className={label}>
                          {key === "debtorId" ? "Debtor (owes)" : "Creditor (is owed)"}
                        </label>
                        <select id={`${key}-${i}`} value={d[key]} onChange={(e) => update(i, { [key]: e.target.value })} className={field}>
                          <option value="">Choose a trader</option>
                          {traders.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <label htmlFor={`amount-${i}`} className={label}>
                        Amount (USD)
                      </label>
                      <input
                        id={`amount-${i}`}
                        inputMode="decimal"
                        value={d.amount}
                        onChange={(e) => update(i, { amount: e.target.value })}
                        placeholder="50"
                        className={field}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`note-${i}`} className={label}>
                      Note
                    </label>
                    <input id={`note-${i}`} value={d.note} onChange={(e) => update(i, { note: e.target.value })} className={field} />
                  </div>
                  {d.debtorId && d.debtorId === d.creditorId && <p className="text-sm text-red-700">The debtor and the creditor must be different traders.</p>}
                  {d.amount && cents === null && <p className="text-sm text-red-700">Type an amount above 0, for example 50 or 12.50.</p>}
                  {valid && !mine && (
                    <p className="text-sm text-red-700">
                      You view the app as {name(traderId)}. You can only save a debt where you are the debtor or the creditor. Change
                      &quot;View as&quot; first.
                    </p>
                  )}
                  {d.error && <ErrorNote error={d.error} />}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn.primary} disabled={!valid || !mine || d.saving} onClick={() => save(i)}>
                      {d.saving ? "Saving..." : "Save"}
                    </button>
                    <button type="button" className={btn.secondary} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
                      Discard
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
