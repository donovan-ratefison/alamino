"use client";

import "@xyflow/react/dist/style.css";
import { Fragment } from "react";
import { Handle, MarkerType, Position, ReactFlow, type Edge as FlowEdge, type Node, type NodeProps } from "@xyflow/react";
import type { Edge, Trader, TraderId } from "@/lib/types";
import { formatUsd } from "./api";

type TraderNodeData = Node<{ label: string }>;
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const hidden = { opacity: 0, pointerEvents: "none" as const };

function TraderNode({ data }: NodeProps<TraderNodeData>) {
  return (
    <div className="network-node">
      {data.label}
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

// Side of a node that faces a point at (dx, dy) from its center.
function side(dx: number, dy: number): Position {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Position.Right : Position.Left;
  return dy > 0 ? Position.Bottom : Position.Top;
}

export function Network({ traders, edges, highlight, label }: { traders: Trader[]; edges: Edge[]; highlight?: TraderId[]; label: string }) {
  const center = new Map(
    traders.map((t, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / traders.length;
      return [t.id, { x: RADIUS * Math.cos(a), y: RADIUS * Math.sin(a) }];
    }),
  );
  const nodes: TraderNodeData[] = traders.map((t) => ({
    id: t.id,
    type: "trader",
    position: { x: center.get(t.id)!.x - 48, y: center.get(t.id)!.y - 20 },
    data: { label: t.name },
  }));

  // One edge per debtor and creditor pair.
  const pairs = new Map<string, Edge>();
  for (const e of edges) {
    const key = `${e.debtorId}>${e.creditorId}`;
    const p = pairs.get(key);
    pairs.set(key, { ...e, amountCents: (p?.amountCents ?? 0) + e.amountCents });
  }

  const lit = new Set(highlight?.map((id, i) => `${id}>${highlight[(i + 1) % highlight.length]}`));
  // Edges at zero stay in the graph but are transparent, so a replay can fade them out.
  const shown = [...pairs.entries()].filter(([, e]) => center.has(e.debtorId) && center.has(e.creditorId));
  const flowEdges: FlowEdge[] = shown.map(([key, e]) => {
    const a = center.get(e.debtorId)!;
    const b = center.get(e.creditorId)!;
    const on = lit.has(key);
    const color = on ? "#0070e0" : lit.size ? "#d4e4f5" : "#8eafd4";
    const fade = { opacity: e.amountCents > 0 ? 1 : 0, transition: "opacity 0.6s, stroke 0.3s, fill 0.3s" };
    return {
      id: key,
      source: e.debtorId,
      target: e.creditorId,
      sourceHandle: `s-${side(b.x - a.x, b.y - a.y)}`,
      targetHandle: `t-${side(a.x - b.x, a.y - b.y)}`,
      type: "straight",
      label: formatUsd(e.amountCents),
      style: { stroke: color, strokeWidth: on ? 3 : 1.5, ...fade },
      labelStyle: { fontSize: 12, fontWeight: 500, fill: on ? "#0070e0" : "#003087", ...fade },
      labelBgStyle: { fill: "#ffffff", ...fade },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      zIndex: on ? 1 : 0,
    };
  });

  const name = (id: TraderId) => traders.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="network-shell">
      <ReactFlow
        aria-label={label}
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      />
      <ul className="sr-only">
        {shown
          .filter(([, e]) => e.amountCents > 0)
          .map(([key, e]) => (
            <li key={key}>
              {name(e.debtorId)} owes {name(e.creditorId)} {formatUsd(e.amountCents)}
            </li>
          ))}
      </ul>
    </div>
  );
}
