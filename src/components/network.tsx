"use client";

import "@xyflow/react/dist/style.css";
import { Fragment, useMemo, useState } from "react";
import { Handle, MarkerType, Position, ReactFlow, type Edge as FlowEdge, type Node, type NodeProps } from "@xyflow/react";
import type { Edge, Trader, TraderId } from "@/lib/types";
import { formatUsd } from "./api";
import { TraderChip } from "./trader-chip";

type TraderNodeData = Node<{ id: TraderId; label: string; active: boolean }>;
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const hidden = { opacity: 0, pointerEvents: "none" as const };

function TraderNode({ data }: NodeProps<TraderNodeData>) {
  return (
    <div className={data.active ? "network-node network-node-active" : "network-node"}>
      <TraderChip id={data.id} name={data.label} size={24} />
      <span>{data.label}</span>
      {SIDES.map((p) => (
        <Fragment key={p}>
          <Handle type="source" id={`s-${p}`} position={p} style={hidden} isConnectable={false} />
          <Handle type="target" id={`t-${p}`} position={p} style={hidden} isConnectable={false} />
        </Fragment>
      ))}
    </div>
  );
}

const nodeTypes = { trader: TraderNode };
const RADIUS = 170;
const COLOR = { on: "#0070e0", circle: "#13865b", base: "#8eafd4", dim: "#d4e4f5" };
// Arrowheads in screen pixels, so they do not grow with the stroke width.
const ARROW = 30;

// Side of a node that faces a point at (dx, dy) from its center.
function side(dx: number, dy: number): Position {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Position.Right : Position.Left;
  return dy > 0 ? Position.Bottom : Position.Top;
}

// "a>b" for each debt in each circle: [a, b, c] means a owes b, b owes c, c owes a.
const ringKeys = (rings: TraderId[][] | undefined) => new Set(rings?.flatMap((r) => r.map((id, i) => `${id}>${r[(i + 1) % r.length]}`)));

export function Network({
  traders,
  edges,
  highlight,
  label,
  interactive = true,
  circles,
}: {
  traders: Trader[];
  edges: Edge[];
  highlight?: TraderId[];
  label: string;
  interactive?: boolean; // hover or focus a trader to show only the debts of that trader
  circles?: TraderId[][]; // edges on these circles get a tint: they can cancel
}) {
  const [focus, setFocus] = useState<TraderId | null>(null);
  const active = interactive ? focus : null;

  const center = useMemo(
    () =>
      new Map(
        traders.map((t, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / traders.length;
          return [t.id, { x: RADIUS * Math.cos(a), y: RADIUS * Math.sin(a) }];
        }),
      ),
    [traders],
  );
  // The same node objects on every render. React Flow drops the measured size of a node
  // when it gets a new object, and a node with no size stays hidden.
  const nodes: TraderNodeData[] = useMemo(
    () =>
      traders.map((t) => ({
        id: t.id,
        type: "trader",
        position: { x: center.get(t.id)!.x - 52, y: center.get(t.id)!.y - 20 },
        ariaLabel: t.name,
        data: { id: t.id, label: t.name, active: t.id === active },
      })),
    [traders, center, active],
  );

  // One edge per debtor and creditor pair.
  const pairs = new Map<string, Edge>();
  for (const e of edges) {
    const key = `${e.debtorId}>${e.creditorId}`;
    const p = pairs.get(key);
    pairs.set(key, { ...e, amountCents: (p?.amountCents ?? 0) + e.amountCents });
  }

  // Edges at zero stay in the graph but are transparent, so a replay can fade them out.
  const shown = [...pairs.entries()].filter(([, e]) => center.has(e.debtorId) && center.has(e.creditorId));
  const lit = active
    ? new Set(shown.filter(([, e]) => e.debtorId === active || e.creditorId === active).map(([key]) => key))
    : ringKeys(highlight ? [highlight] : undefined);
  const ring = ringKeys(circles);

  // Stroke width from 1.5 px (smallest amount on screen) to 9 px (largest).
  const amounts = shown.map(([, e]) => e.amountCents).filter((c) => c > 0);
  const min = Math.min(...amounts);
  const span = Math.max(...amounts) - min;
  const width = (cents: number) => (cents <= 0 ? 1.5 : span > 0 ? 1.5 + (7.5 * (cents - min)) / span : 4);

  const flowEdges: FlowEdge[] = shown.map(([key, e]) => {
    const a = center.get(e.debtorId)!;
    const b = center.get(e.creditorId)!;
    const on = lit.has(key);
    const dim = lit.size > 0 && !on;
    const color = on ? COLOR.on : dim ? COLOR.dim : ring.has(key) ? COLOR.circle : COLOR.base;
    const opacity = e.amountCents > 0 ? (dim ? 0.45 : 1) : 0;
    const fade = { opacity, transition: "opacity 0.6s, stroke 0.3s, stroke-width 0.6s, fill 0.3s" };
    return {
      id: key,
      source: e.debtorId,
      target: e.creditorId,
      sourceHandle: `s-${side(b.x - a.x, b.y - a.y)}`,
      targetHandle: `t-${side(a.x - b.x, a.y - b.y)}`,
      type: "straight",
      label: formatUsd(e.amountCents),
      ariaLabel: `${name(e.debtorId)} owes ${name(e.creditorId)} ${formatUsd(e.amountCents)}`,
      style: { stroke: color, strokeWidth: width(e.amountCents), ...fade },
      labelStyle: { fontSize: 12, fontWeight: 500, fill: on ? COLOR.on : "#003087", ...fade },
      labelBgStyle: { fill: "#ffffff", ...fade },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: ARROW, height: ARROW, markerUnits: "userSpaceOnUse" },
      zIndex: on ? 1 : 0,
    };
  });

  function name(id: TraderId) {
    return traders.find((t) => t.id === id)?.name ?? id;
  }

  // Keyboard focus on a trader node acts like hover. React Flow sets data-id on the node element.
  const focusedId = (target: EventTarget) => (target as HTMLElement).closest?.(".react-flow__node")?.getAttribute("data-id") ?? null;

  return (
    <div
      className="network-shell"
      onFocus={interactive ? (e) => setFocus(focusedId(e.target)) : undefined}
      onBlur={interactive ? () => setFocus(null) : undefined}
    >
      <ReactFlow
        aria-label={label}
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={interactive}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        onNodeMouseEnter={interactive ? (_, n) => setFocus(n.id) : undefined}
        onNodeMouseLeave={interactive ? () => setFocus(null) : undefined}
      />
      <ul className="sr-only">
        {shown
          .filter(([, e]) => e.amountCents > 0)
          .map(([key, e]) => (
            <li key={key}>
              {`${name(e.debtorId)} owes ${name(e.creditorId)} ${formatUsd(e.amountCents)}${ring.has(key) ? ", can cancel in a circle" : ""}`}
            </li>
          ))}
      </ul>
    </div>
  );
}
