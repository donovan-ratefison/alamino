import type { AgReportState, AgWidgetState, AgDefaultRegistry } from "ag-studio";

export const financePages = [
  ["overview", "Financial Overview"], ["revenue", "Revenue Analytics"], ["monitoring", "Payment Monitoring"],
  ["debts", "Debt Tracker"], ["transactions", "Transaction Analytics"],
] as const;

function chart(title: string, category: string, values: string[]): AgWidgetState<AgDefaultRegistry> {
  return { type: "column-chart-grouped", format: { title: { text: title, enabled: true }, style: { theme: { common: { legend: { enabled: true } } } } }, dataMapping: { categoryKey: [{ id: category }], valueKey: values.map((id) => ({ id, aggregation: "sum" as const })) } };
}
function grid(title: string, fields: string[]): AgWidgetState<AgDefaultRegistry> {
  return { type: "grid", format: { title: { text: title, enabled: true } }, dataMapping: { cols: fields.map((id) => ({ id })) } };
}
export function defaultFinanceReport(): AgReportState {
  const flow = chart("Completed payment flows by day", "transactions.day", ["transactions.received", "transactions.paidOut", "transactions.refunded"]);
  const status = chart("Records by payment status", "transactions.status", ["transactions.records"]);
  const tx = grid("Transaction details", ["transactions.id", "transactions.customer", "transactions.amount", "transactions.currency", "transactions.date", "transactions.status", "transactions.kind"]);
  const definitions: Record<string, AgWidgetState<AgDefaultRegistry>[]> = {
    overview: [flow, status],
    revenue: [chart("Clearing receipts by customer · not commission revenue", "transactions.customer", ["transactions.received"]), flow],
    monitoring: [status, tx],
    debts: [chart("Outstanding demo debts by debtor · USD", "debts.debtor", ["debts.remaining"]), grid("Local demonstration ledger", ["debts.debtor", "debts.creditor", "debts.amount", "debts.remaining", "debts.status"])],
    transactions: [chart("Transactions by type", "transactions.kind", ["transactions.records"]), tx],
  };
  return { version: "3.1.0", selectedPageId: "overview", pages: financePages.map(([id]) => ({ id,
    widgets: Object.fromEntries(definitions[id].map((w, i) => [`widget-${i}`, w])),
    widgetLayout: { "widget-0": { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 16 }, "widget-1": { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 16 } },
    layout: { columns: 24, rowHeight: 24, widgetBorderRadius: 20, pagePadding: 16, backgroundColor: "#f5f9ff", widgetBackgroundColor: "#ffffff", widgetBorderEnabled: true, widgetBorderColor: "#dce5f2", widgetBorderWidth: 1 },
  })), panels: { filters: { collapsed: true }, data: { collapsed: true }, edit: { collapsed: true }, ai: { collapsed: true } } };
}
