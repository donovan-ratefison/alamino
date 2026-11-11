"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, AgStudioLicenseManager, clientToolRunner, createAiHarness, type AgAiHarnessSetup, type AgStudioApi, type AgDefaultRegistry, type AgDataSourcesDefinition, type AgReportState } from "ag-studio";
import type { FinanceSnapshot } from "@/lib/finance/types";
import { defaultFinanceReport, financePages } from "./presets";
import { btn, ErrorNote } from "../ui";
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
          const saved = localStorage.getItem("alamino.finance.demo.layout.v1");
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
      if (snapshot.source === "demo") localStorage.setItem("alamino.finance.demo.layout.v1", JSON.stringify(state));
      else { const response = await fetch("/api/finance/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }); if (!response.ok) throw new Error((await response.json()).error); }
      setNotice(snapshot.source === "demo" ? "Demo layout saved in this browser." : "Sandbox layout saved on the server.");
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
  return <section id="financial-workspace" className="finance-studio space-y-5" aria-label="AG Studio financial dashboards">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="eyebrow text-accent">Made to make sense</p><h2 className="section-title mt-3">Your financial workspace.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500">Explore the details. Make the dashboard yours. Ask a question when you need a clearer picture.</p></div>
      <div className="flex flex-wrap gap-2"><button className={btn.secondary} onClick={openAssistant} disabled={!ready}>Finance assistant</button><button className={btn.secondary} onClick={() => setMode(mode === "edit" ? "view" : "edit")}>{mode === "edit" ? "Switch to view" : "Customise dashboard"}</button><button className={btn.primary} onClick={save} disabled={!ready}>Save layout</button><button className={btn.small} onClick={() => { ref.current?.api?.setState(defaultFinanceReport()); setPage("overview"); setNotice("Default layout restored. Save to keep it."); }}>Reset layout</button></div>
    </div>
    <nav aria-label="Finance dashboards" className="finance-studio-tabs">{financePages.map(([id, title]) => <button key={id} onClick={() => choosePage(id)} aria-pressed={page === id} className="finance-studio-tab">{title}</button>)}</nav>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <ErrorNote error={error} />}
    <div className="finance-studio-canvas">
      <AgStudioProvider modules={MODULES}><AgStudio<AgDefaultRegistry> ref={ref} style={STUDIO_STYLE} theme={financeStudioTheme} data={data} mode={mode} initialState={initial} ai={ai} loadThemeGoogleFonts={false}
        onStudioReady={() => setReady(true)} onStateUpdated={({ state }: { state: AgReportState }) => setPage(state.selectedPageId)}
        panels={{ edit: { right: ["ai", "edit", "data", "filters"] }, view: { right: ["filters"] } }}
        responsiveLayoutBreakpoints={[{ maxWidth: 650, layout: (items) => { let y = 0; return items.map((item) => { const position = { ...item.layout, xTrack: 0, yTrack: y, xSpan: 24 }; y += position.ySpan; return position; }); } }, {}]} />
      </AgStudioProvider>
    </div>
    {!process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY && <p className="text-xs text-amber-800">AG Studio evaluation mode. Configure a valid Studio licence before deployment; its built-in watermark is preserved.</p>}
  </section>;
}
