"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Debt, DebtDraft, TraderId } from "@/lib/types";
import { api, toCents } from "@/components/api";
import { useApp } from "@/components/app";
import { DraftRow, problem, toDraft, type Draft } from "@/components/capture-drafts";
import { Badge, btn, Card, ErrorNote, field, label, PageHeader } from "@/components/ui";

// A real AI call takes 5 to 10 seconds. The last step stays until the answer.
const STEPS = ["Reading the handwriting", "Matching names to traders", "Checking the amounts"];

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
  const { traderId, name, refreshPending } = useApp();
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false); // phone: the sentence field is open
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [engine, setEngine] = useState<"model" | "fallback" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState<TraderId | null>(null); // the trader who read the page
  const [changed, setChanged] = useState(false); // drafts were cleared after a "View as" change
  const view = useRef<HTMLDivElement>(null);

  useEffect(() => (photo ? () => URL.revokeObjectURL(photo.url) : undefined), [photo]);

  useEffect(() => {
    if (!reading) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    return () => clearInterval(id);
  }, [reading]);

  useEffect(() => {
    if (reading || engine) view.current?.scrollIntoView({ block: "start" });
  }, [reading, engine]);

  // The drafts belong to the trader who read the page. Another "View as" clears them.
  if (engine && owner !== traderId) {
    clear();
    setChanged(true);
  }

  const viewer = name(traderId);
  const update = (n: number, patch: Partial<Draft>) => setDrafts((all) => all.map((d) => (d.n === n ? { ...d, ...patch } : d)));
  const isReady = (d: Draft) => !d.saved && problem(d) === null;
  const saved = drafts.filter((d) => d.saved).length;
  const ready = drafts.filter(isReady).length;
  const waiting = drafts.length - saved - ready;
  const allSaved = drafts.length > 0 && saved === drafts.length;
  // The other open drafts with no direction: one answer can serve them all.
  const noWay = (n: number) => drafts.filter((x) => x.n !== n && !x.saved && !x.direction);

  async function read(file: File | null) {
    setReading(true);
    setStep(0);
    setError(null);
    setChanged(false);
    setOwner(traderId);
    try {
      const input = file ? await readImage(file) : { text: text.trim() };
      const res = await api<{ drafts: DebtDraft[]; engine: "model" | "fallback" }>("/api/capture", { ...input, createdBy: traderId });
      setDrafts(res.drafts.map((d, i) => toDraft(d, i + 1, traderId, file ? "photo" : "text")));
      setEngine(res.engine);
    } catch (e) {
      setError(e as Error);
    }
    setReading(false);
  }

  // Choosing a photo starts the reading at once.
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be chosen again
    if (!file) return;
    setPhoto({ file, url: URL.createObjectURL(file) });
    read(file);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setPhoto(null);
    read(null);
  }

  function clear() {
    setEngine(null);
    setDrafts([]);
    setPhoto(null);
    setError(null);
  }

  function again() {
    clear();
    setText("");
    setTyping(false);
    setChanged(false);
  }

  // A line the AI missed. It opens in its full form, with "You owe" as the default direction.
  function addLine() {
    const n = Math.max(0, ...drafts.map((d) => d.n)) + 1;
    const line: Draft = {
      n,
      otherId: "",
      otherText: "",
      direction: "you_owe",
      amount: "",
      note: "",
      confidence: "high",
      need: { otherId: true, direction: false, amount: true },
      manual: true,
      editing: true,
      source: photo ? "photo" : "text",
    };
    setDrafts((all) => [...all, line]);
  }

  // Posts every ready draft, one after the other. A failure stays open with its error.
  async function saveAll() {
    setSaving(true);
    for (const d of drafts.filter(isReady)) {
      const youOwe = d.direction === "you_owe";
      const patch = await api<Debt>("/api/debts", {
        debtorId: youOwe ? traderId : d.otherId,
        creditorId: youOwe ? d.otherId : traderId,
        amountCents: toCents(d.amount),
        note: d.note.trim(),
        source: d.source,
        createdBy: traderId,
      }).then(
        (debt): Partial<Draft> => ({ saved: debt, editing: false, error: undefined }),
        (error: Error): Partial<Draft> => ({ error, editing: true }),
      );
      update(d.n, patch);
    }
    setSaving(false);
    refreshPending();
  }

  const addButton = (
    <button type="button" className={btn.secondary} disabled={saving} onClick={addLine}>
      Add a line
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title="Add a debt">
        {/* A phone shows the trader in "View as" and above the drafts: no need to say it here. */}
        <span className="max-sm:hidden">
          You add debts as <span className="font-medium text-zinc-900">{viewer}</span>. Nothing is saved before you check it.
        </span>
      </PageHeader>

      {!reading && !engine && (
        <Card title="Your debt, in your words.">
          {changed && (
            <p role="status" className="mb-4 text-sm text-zinc-600">
              Trader changed. Read the page again.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid content-start gap-2">
              <label className="capture-shot capture-pick">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                Photograph your notebook
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <label className={`${btn.secondary} capture-pick capture-alt`}>
                  Choose a photo
                  <input type="file" accept="image/*" className="sr-only" onChange={pick} />
                </label>
                <button
                  type="button"
                  className={`${btn.secondary} capture-alt capture-type`}
                  aria-expanded={typing}
                  aria-controls="capture-form"
                  onClick={() => setTyping((t) => !t)}
                >
                  Type a sentence
                </button>
              </div>
            </div>
            <form id="capture-form" onSubmit={submit} className={`space-y-3 sm:order-first ${typing ? "" : "max-sm:hidden"}`}>
              <label htmlFor="capture-text" className={label}>
                Sentence
              </label>
              <textarea
                id="capture-text"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="I owe Hery 50 for rice"
                className={`${field} h-auto py-2`}
              />
              <button type="submit" className={btn.primary} disabled={!text.trim()}>
                Read the sentence
              </button>
            </form>
          </div>
          {error && (
            <div className="mt-4">
              <ErrorNote error={error} />
            </div>
          )}
        </Card>
      )}

      {(reading || engine) && (
        <div ref={view} className="capture-result space-y-4">
          {engine && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium text-zinc-900">Drafts</h2>
                {engine === "fallback" && <Badge>Read without AI: check each line</Badge>}
              </div>
              {!allSaved && (
                <button type="button" className={btn.small} disabled={saving} onClick={again}>
                  Read another page
                </button>
              )}
              <p className="basis-full text-sm text-zinc-600">
                Notebook of <span className="font-medium text-zinc-900">{viewer}</span>. Every line is a debt between you and one other trader.
              </p>
            </div>
          )}
          <div className="capture-view">
            <div className="capture-source">
              {photo ? (
                <div className="capture-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise */}
                  <img src={photo.url} alt="Your notebook page" />
                  {reading && <div className="capture-scan" aria-hidden="true" />}
                </div>
              ) : (
                <blockquote className="capture-sentence">{text}</blockquote>
              )}
            </div>
            <div className="min-w-0 space-y-3">
              {reading ? (
                <p role="status" className="capture-status">
                  <span className="capture-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  {STEPS[step]}
                </p>
              ) : drafts.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-600">No debt to check. Add a line by hand, or read another page.</p>
                  {addButton}
                </div>
              ) : (
                <>
                  <ol className="grid gap-2">
                    {drafts.map((d, i) => (
                      <DraftRow
                        key={d.n}
                        d={d}
                        index={i}
                        busy={saving}
                        onChange={(patch) => update(d.n, patch)}
                        onDiscard={() => setDrafts((all) => all.filter((x) => x.n !== d.n))}
                        applyCount={d.wayAnswered ? noWay(d.n).length : 0}
                        onApply={() => noWay(d.n).forEach((x) => update(x.n, { direction: d.direction, answered: true }))}
                      />
                    ))}
                  </ol>
                  {!allSaved && addButton}
                  {allSaved ? (
                    <div role="status" className="capture-done">
                      <p className="text-sm text-zinc-900">All debts are saved. The other side of each debt must confirm it.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href="/" className={btn.small}>
                          Go to the market
                        </Link>
                        <Link href="/confirm" className={btn.small}>
                          Go to Confirm
                        </Link>
                        <button type="button" className={btn.small} onClick={again}>
                          Read another page
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="capture-savebar">
                      <p role="status" className="text-sm text-zinc-600">
                        {[saved && `${saved} saved`, `${ready} ready`, waiting && `${waiting} ${waiting === 1 ? "needs" : "need"} an answer`]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      <button type="button" className={btn.primary} disabled={ready === 0 || saving} onClick={saveAll}>
                        {saving ? "Saving..." : `Save ${ready} ${ready === 1 ? "debt" : "debts"}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
