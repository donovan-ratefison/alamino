"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, AgStudioLicenseManager, clientToolRunner, createAiHarness, type AgAiHarnessSetup, type AgStudioApi, type AgDefaultRegistry, type AgDataSourcesDefinition, type AgReportState } from "ag-studio";
import type { FinanceSnapshot } from "@/lib/finance/types";
import { defaultFinanceReport, financePages } from "./presets";
import { btn, ErrorNote } from "../ui";

const LAYOUT_KEY = "alamino.finance.layout.v2";
const MAIN_PAGES: string[] = ["overview", "monitoring"];
import { financeStudioTheme } from "./studio-theme";

if (process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY) AgStudioLicenseManager.setLicenseKey(process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY);
const MODULES = [AgStudioAiModule];
const STUDIO_STYLE = { width: "100%", height: "100%" };

export default function FinanceStudio({ snapshot, currency, authenticated }: { snapshot: FinanceSnapshot; currency: string; authenticated: boolean }) {
  const ref = useRef<AgStudio<AgDefaultRegistry>>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [page, setPage] = useState("overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  const initial = useMemo(() => defaultFinanceReport(), []);
  const data = useMemo<AgDataSourcesDefinition<AgDefaultRegistry>>(() => {
    const transactions = snapshot.transactions.filter((t) => t.currency === currency).map((t) => ({ ...t, day: t.date.slice(0, 10), records: 1,
      received: t.status === "completed" && t.kind === "payment" && t.amount > 0 ? t.amount : 0,
      paidOut: t.status === "completed" && ["payment", "payout"].includes(t.kind) && t.amount < 0 ? -t.amount : 0,
      refunded: t.status === "completed" && t.kind === "refund" && t.amount < 0 ? -t.amount : 0 }));
    const textFields = ["id", "customer", "currency", "date", "day", "status", "method", "kind", "source"];
    const numberFields = ["amount", "received", "paidOut", "refunded", "records"];
    return { sources: [
      { id: "transactions", name: `Transactions · ${snapshot.source} · ${currency}`, data: transactions,
        fields: [...textFields.map((id) => ({ id, format: "textFormat" as const })), ...numberFields.map((id) => ({ id, format: "decimalFormat" as const }))] },
      { id: "debts", name: "Alamino demo debt ledger · USD", data: currency === "USD" ? snapshot.debts.map((d) => ({ ...d })) : [],
        fields: [...["id", "debtor", "creditor", "status", "date", "currency"].map((id) => ({ id, format: "textFormat" as const })), ...["amount", "remaining"].map((id) => ({ id, format: "decimalFormat" as const }))] },
    ] };
  }, [snapshot, currency]);
  const ai = useMemo<AgAiHarnessSetup>(() => (setup) => {
    const api = setup.api as AgStudioApi;
    const studio = api.getAiTools();
    const agent = clientToolRunner({ id: "alamino-finance", name: "Alamino Finance", maxTurns: 4,
      tools: () => [studio.viewSchema(), studio.viewReport(), studio.viewPage(), studio.executeQuery(), studio.addWidget(), studio.positionWidget(), studio.addPageFilter(), studio.removePageFilter(), studio.configureWidget({ widgetType: "column-chart-grouped" })],
      run: async function* (input, ctx) {
        const response = await fetch("/api/finance/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctx.signal,
          body: JSON.stringify({ source: snapshot.source, start: snapshot.start, end: snapshot.end, currency, messages: input.messages,
            tools: ctx.tools().map((t) => t.schema()).filter(Boolean), context: { report: api.getState(), schema: api.getAiContext().schema() } }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Finance assistant failed");
        const messageId = crypto.randomUUID();
        yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" };
        yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: `[${result.engine}] ${result.answer}` };
        yield { type: "TEXT_MESSAGE_END", messageId };
        for (const call of result.toolCalls ?? []) {
          const toolCallId = crypto.randomUUID();
          yield { type: "TOOL_CALL_START", toolCallId, toolCallName: call.name };
          yield { type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify(call.args) };
          yield { type: "TOOL_CALL_END", toolCallId };
        }
      },
    });
    return createAiHarness(api, () => ({ agents: [agent], primary: agent.id, promptStarters: [
      { label: "Received today", prompt: "How much have we received today?" },
      { label: "Pending payments", prompt: "How many payments are pending?" },
      { label: "Refunds", prompt: "Which refunds have been completed?" },
      { label: "Compare weeks", prompt: "Compare this week’s receipts with the same period last week." },
      { label: "Create a chart", prompt: "Add a column chart showing completed receipts by customer." },
    ] }));
  }, [snapshot.source, snapshot.start, snapshot.end, currency]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function restore() {
      try {
        if (snapshot.source === "sandbox") {
          if (!authenticated) return;
          const response = await fetch("/api/finance/dashboard"); const json = await response.json();
          if (!response.ok) throw new Error(json.error);
          if (active && json.state) ref.current?.api?.setState(json.state);
        } else {
          const saved = localStorage.getItem(LAYOUT_KEY);
          if (active && saved) ref.current?.api?.setState(JSON.parse(saved));
        }
      } catch { if (active) setError(new Error("Saved layout could not be restored. The default layout is available.")); }
    }
    void restore(); return () => { active = false; };
  }, [ready, snapshot.source, authenticated]);

  async function save() {
    const state = ref.current?.api?.getState(); if (!state) return;
    setError(null);
    try {
      if (snapshot.source !== "sandbox") localStorage.setItem(LAYOUT_KEY, JSON.stringify(state));
      else { const response = await fetch("/api/finance/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }); if (!response.ok) throw new Error((await response.json()).error); }
      setNotice(snapshot.source !== "sandbox" ? "Layout saved in this browser." : "Sandbox layout saved on the server.");
    } catch (e) { setError(e as Error); }
  }
  function choosePage(id: string) {
    const state = ref.current?.api?.getState(); if (state) ref.current?.api?.setState({ ...state, selectedPageId: id }); setPage(id);
  }
  function openAssistant() {
    setMode("edit");
    const state = ref.current?.api?.getState();
    if (state) ref.current?.api?.setState({ ...state, panels: { ...state.panels, ai: { collapsed: false }, data: { collapsed: true }, edit: { collapsed: true }, filters: { collapsed: true } } });
  }
  return <section id="financial-workspace" className="space-y-4" aria-label="AG Studio financial dashboards">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Finance dashboards" className="flex flex-wrap items-center gap-2">
        {financePages.filter(([id]) => MAIN_PAGES.includes(id)).map(([id, title]) => <button key={id} type="button" onClick={() => choosePage(id)} aria-pressed={page === id} className="finance-studio-tab">{title}</button>)}
        <select aria-label="More views" value={MAIN_PAGES.includes(page) ? "" : page} onChange={(e) => choosePage(e.target.value)}
          className={`min-h-11 rounded-full border px-4 text-xs font-medium ${MAIN_PAGES.includes(page) ? "border-[#dce5f2] bg-white text-[#4b607e]" : "border-[#003087] bg-[#003087] text-white"}`}>
          <option value="" disabled>More views</option>
          {financePages.filter(([id]) => !MAIN_PAGES.includes(id)).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.secondary} onClick={openAssistant} disabled={!ready}>Finance assistant</button>
        <details className="relative">
          <summary className={`${btn.secondary} list-none [&::-webkit-details-marker]:hidden`}>{mode === "edit" ? "Layout (editing)" : "Layout"}</summary>
          {/* A click on a menu item bubbles here and closes the menu. */}
          <div onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")} className="absolute right-0 z-20 mt-2 grid w-56 gap-1 rounded-[16px] border border-[#dce5f2] bg-white p-2 shadow-lg">
            <button type="button" className={btn.small} onClick={() => setMode(mode === "edit" ? "view" : "edit")}>{mode === "edit" ? "Stop customising" : "Customise dashboard"}</button>
            <button type="button" className={btn.small} onClick={save} disabled={!ready}>Save layout</button>
            <button type="button" className={btn.small} onClick={() => { ref.current?.api?.setState(defaultFinanceReport()); setPage("overview"); setNotice("Default layout restored. Save to keep it."); }}>Reset layout</button>
          </div>
        </details>
      </div>
    </div>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <ErrorNote error={error} />}
    <div className={`min-w-0 overflow-hidden rounded-[20px] border border-[#dce5f2] bg-white ${mode === "edit" ? "h-[760px]" : "h-[520px] max-md:h-[680px]"}`}>
      <AgStudioProvider modules={MODULES}><AgStudio<AgDefaultRegistry> ref={ref} style={STUDIO_STYLE} theme={financeStudioTheme} data={data} mode={mode} initialState={initial} ai={ai} loadThemeGoogleFonts={false}
        onStudioReady={() => setReady(true)} onStateUpdated={({ state }: { state: AgReportState }) => setPage(state.selectedPageId)}
        panels={{ edit: { right: ["ai", "edit", "data", "filters"] }, view: { right: ["filters"] } }}
        responsiveLayoutBreakpoints={[{ maxWidth: 650, layout: (items) => { let y = 0; return items.map((item) => { const position = { ...item.layout, xTrack: 0, yTrack: y, xSpan: 24, ySpan: 12 }; y += position.ySpan; return position; }); } }, {}]} />
      </AgStudioProvider>
    </div>
  </section>;
}
