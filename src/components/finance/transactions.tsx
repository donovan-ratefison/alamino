"use client";
import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import type { FinanceTransaction } from "@/lib/finance/types";
import { currencyDigits, money } from "@/lib/finance/metrics";
import { btn, Card, field } from "../ui";
import { financeGridTheme } from "./theme";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function Transactions({ rows }: { rows: FinanceTransaction[] }) {
  const grid = useRef<AgGridReact<FinanceTransaction>>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const columns = useMemo<ColDef<FinanceTransaction>[]>(() => [
    { field: "id", headerName: "Transaction ID", minWidth: 180 }, { field: "customer", headerName: "Customer", minWidth: 150 },
    { field: "amountMinor", headerName: "Amount", filter: "agNumberColumnFilter", valueFormatter: ({ data }) => data ? money(data.amountMinor, data.currency) : "", type: "rightAligned", minWidth: 130 },
    { field: "currency", minWidth: 95 }, { field: "date", headerName: "Date (UTC)", minWidth: 175, valueFormatter: ({ value }) => String(value).replace("T", " ").slice(0, 19), sort: "desc" },
    { field: "status", minWidth: 120, cellStyle: ({ value }) => ({ color: value === "completed" ? "#047857" : value === "failed" ? "#b91c1c" : value === "pending" ? "#92400e" : "#475569", fontWeight: 600 }) },
    { field: "kind", headerName: "Type", minWidth: 110 }, { field: "method", headerName: "Payment method", minWidth: 210 }, { field: "source", minWidth: 100 },
  ], []);
  const filtered = useMemo(() => status === "all" ? rows : rows.filter((r) => r.status === status), [rows, status]);
  return <Card title="Transaction explorer" actions={<span className="text-xs text-slate-500">{filtered.length} records · table filters apply here only</span>}>
    <div className="mb-4 flex flex-wrap gap-3"><label className="min-w-44 flex-1 text-xs text-slate-500">Search transactions<input className={`${field} mt-1`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, ID, status…" /></label>
      <label className="text-xs text-slate-500">Payment status<select className={`${field} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>{["all", "completed", "pending", "failed", "reversed", "unknown"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <button className={`${btn.secondary} self-end`} disabled={!filtered.length} onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "alamino-transactions.csv", processCellCallback: ({ value, column, node }) => {
        if (column.getColId() === "amountMinor" && node?.data) return (node.data.amountMinor / 10 ** currencyDigits(node.data.currency)).toFixed(currencyDigits(node.data.currency));
        return typeof value === "string" && /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
      } })}>Export CSV</button></div>
    <div id="transaction-explorer" className="w-full min-w-0 scroll-mt-8"><AgGridReact<FinanceTransaction> ref={grid} theme={financeGridTheme} rowData={filtered} columnDefs={columns} domLayout="autoHeight"
      defaultColDef={{ sortable: true, filter: true, resizable: true, flex: 1 }} quickFilterText={search} pagination paginationPageSize={10} paginationPageSizeSelector={[10, 25, 50]}
      getRowId={({ data }) => `${data.id}:${data.eventCode ?? "order"}:${data.date}`} overlayNoRowsTemplate="<span>No transactions match this selection.</span>" /></div>
  </Card>;
}
