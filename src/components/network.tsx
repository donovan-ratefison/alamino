"use client";

import "@xyflow/react/dist/style.css";
import { useId, useMemo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  useInternalNode,
  type Edge as FlowEdge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { HOUSE, type Edge, type Trader, type TraderId } from "@/lib/types";
import { formatUsd } from "./api";
import { TraderChip } from "./trader-chip";

type TraderNodeData = Node<{ id: TraderId; label: string; size: number; center: boolean; above: boolean; active: boolean; faded: boolean }, "trader">;
type LinkEdgeData = FlowEdge<
  { bend: number; color: string; width: number; opacity: number; marker?: string; label?: string; labelColor?: string; dash?: string },
  "link"
>;

const hidden = { opacity: 0, pointerEvents: "none" as const };
// Ellipse of the ring: the network box is wider than it is tall.
const RING = { x: 160, y: 125 };
const SIZE = { node: 40, center: 56 };
const GAP = 4; // space between a node rim and a line end
const ARROW = 9; // arrow head length in screen pixels, the same for all stroke widths
const BEND = 0.18; // house view: control point offset, as a part of the line length
const COLOR = {
  on: "#0070e0",
  circle: "#13865b",
  base: "#5b8bd0",
  dim: "#d4e4f5",
  private: "#8192ac",
  owe: "#c2410c",
  get: "#13865b",
};
const FADE = "opacity 0.6s, stroke 0.3s, stroke-width 0.6s";

// The trader name stays as text outside the circle. The centre of a trader view has its name for screen readers only.
function TraderNode({ data }: NodeProps<TraderNodeData>) {
  const cls = `network-node${data.active ? " network-node-active" : ""}${data.faded ? " network-node-faded" : ""}`;
  return (
    <div className={cls}>
      <TraderChip id={data.id} name={data.label} size={data.size} />
      <span className={data.center ? "sr-only" : data.above ? "network-name network-name-above" : "network-name"}>{data.label}</span>
      <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
    </div>
  );
}

// A quadratic curve between the two node centres. It starts and stops at the circle rims and bends to one side.
// Two opposite debts between the same pair bend to opposite sides, because the direction flips.
function LinkEdge({ id, source, target, data }: EdgeProps<LinkEdgeData>) {
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  if (!a?.measured.width || !b?.measured.width || !data) return null;
  const ra = a.measured.width / 2;
  const rb = b.measured.width / 2;
  const ax = a.internals.positionAbsolute.x + ra;
  const ay = a.internals.positionAbsolute.y + ra;
  const bx = b.internals.positionAbsolute.x + rb;
  const by = b.internals.positionAbsolute.y + rb;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const s = { x: ax + ux * (ra + GAP), y: ay + uy * (ra + GAP) };
  const t = { x: bx - ux * (rb + GAP), y: by - uy * (rb + GAP) };
  const c = { x: (s.x + t.x) / 2 - uy * len * data.bend, y: (s.y + t.y) / 2 + ux * len * data.bend };
  // The line stops at the base of the arrow head, so a thick line does not show past the tip at t.
  const tc = Math.hypot(t.x - c.x, t.y - c.y) || 1;
  const cut = data.marker ? ARROW : 0;
  const end = { x: t.x - ((t.x - c.x) / tc) * cut, y: t.y - ((t.y - c.y) / tc) * cut };
  const mid = { x: 0.25 * s.x + 0.5 * c.x + 0.25 * t.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * t.y };
  return (
    <>
      <BaseEdge
        id={id}
        path={`M${s.x} ${s.y} Q${c.x} ${c.y} ${end.x} ${end.y}`}
        markerEnd={data.marker}
        interactionWidth={0}
        style={{ stroke: data.color, strokeWidth: data.width, strokeDasharray: data.dash, strokeLinecap: "round", opacity: data.opacity, transition: FADE }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="network-amount"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`, color: data.labelColor, opacity: data.opacity }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { trader: TraderNode };
const edgeTypes = { link: LinkEdge };

// The aria label and screen reader text of a private link.
const privateText = (hidden: number) =>
  hidden === 0 ? "Private link" : `Private link through ${hidden} other ${hidden === 1 ? "trader" : "traders"}`;

// "a>b" for each debt in each circle: [a, b, c] means a owes b, b owes c, c owes a.
const ringKeys = (rings: TraderId[][] | undefined) => new Set(rings?.flatMap((r) => r.map((id, i) => `${id}>${r[(i + 1) % r.length]}`)));

export function Network({
  traders,
  edges,
  highlight,
  label,
  interactive = true,
  circles,
  privateLinks,
  center,
}: {
  traders: Trader[];
  edges: Edge[];
  highlight?: TraderId[];
  label: string;
  interactive?: boolean; // hover or focus a trader to show only the debts of that trader
  circles?: TraderId[][]; // edges on these circles get a tint: they can cancel
  // Trader view of a circle: the part between two other traders. A dotted grey line, no amount, no arrow.
  privateLinks?: { from: TraderId; to: TraderId; hidden: number }[];
  center?: TraderId; // trader view: this trader in the middle, the other traders on a ring around
}) {
  const uid = useId().replace(/[^\w-]/g, "");
  const [focus, setFocus] = useState<TraderId | null>(null);
  const active = interactive ? focus : null;
  const middle = center && traders.some((t) => t.id === center) ? center : undefined;
  const known = (id: TraderId) => traders.some((t) => t.id === id);

  // One edge per debtor and creditor pair.
  const pairs = new Map<string, Edge>();
  for (const e of edges) {
    const key = `${e.debtorId}>${e.creditorId}`;
    const p = pairs.get(key);
    pairs.set(key, { ...e, amountCents: (p?.amountCents ?? 0) + e.amountCents });
  }
  const links = (privateLinks ?? []).filter((l) => known(l.from) && known(l.to));

  // Partners of the centre: a debt with the centre or a private link. A live partner has an amount over zero.
  const tie = new Map<TraderId, boolean>();
  for (const e of middle ? edges : []) {
    const other = e.debtorId === middle ? e.creditorId : e.creditorId === middle ? e.debtorId : null;
    if (other) tie.set(other, !!tie.get(other) || e.amountCents > 0);
  }
  for (const l of middle ? links : []) [l.from, l.to].forEach((id) => tie.set(id, true));
  const live = [...tie].filter(([, on]) => on).map(([id]) => id).join(" ");

  const spot = useMemo(() => {
    // Every trader has a fixed place on the ring, so the replay and Before / After never move a node.
    const ring = traders.filter((t) => t.id !== middle);
    const map = new Map(
      ring.map((t, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
        return [t.id, { x: RING.x * Math.cos(a), y: RING.y * Math.sin(a) }];
      }),
    );
    if (middle) map.set(middle, { x: 0, y: 0 });
    return map;
  }, [traders, middle]);

  // The same node objects on every render. React Flow drops the measured size of a node
  // when it gets a new object, and a node with no size stays hidden.
  const nodes: TraderNodeData[] = useMemo(
    () =>
      traders.map((t) => {
        const p = spot.get(t.id)!;
        const size = t.id === middle ? SIZE.center : SIZE.node;
        return {
          id: t.id,
          type: "trader",
          position: { x: p.x - size / 2, y: p.y - size / 2 },
          ariaLabel: t.name,
          data: {
            id: t.id,
            label: t.name,
            size,
            center: t.id === middle,
            above: p.y < -0.3 * RING.y,
            active: t.id === active,
            faded: !!middle && t.id !== middle && !live.split(" ").includes(t.id),
          },
        };
      }),
    [traders, spot, middle, active, live],
  );

  // Edges at zero stay in the graph but are transparent, so a replay can fade them out.
  const shown = [...pairs.entries()].filter(([, e]) => spot.has(e.debtorId) && spot.has(e.creditorId));
  const lit = active
    ? new Set(shown.filter(([, e]) => e.debtorId === active || e.creditorId === active).map(([key]) => key))
    : ringKeys(highlight ? [highlight] : undefined);
  const ring = ringKeys(circles);

  // Stroke width from 1.5 px (smallest amount on screen) to 6 px (largest).
  const amounts = shown.map(([, e]) => e.amountCents).filter((c) => c > 0);
  const min = Math.min(...amounts);
  const span = Math.max(...amounts) - min;
  const width = (cents: number) => (cents <= 0 ? 1.5 : span > 0 ? 1.5 + (4.5 * (cents - min)) / span : 3);

  const flowEdges: LinkEdgeData[] = shown.map(([key, e]) => {
    const on = lit.has(key);
    const dim = lit.size > 0 && !on;
    // Trader view: a spoke to or from the centre has the colour of its direction.
    const owe = e.debtorId === middle;
    const spoke = owe || e.creditorId === middle;
    const tone = spoke ? (owe ? "owe" : "get") : dim ? "dim" : on ? "on" : ring.has(key) ? "circle" : "base";
    const usd = formatUsd(e.amountCents);
    return {
      id: key,
      source: e.debtorId,
      target: e.creditorId,
      type: "link",
      ariaLabel: `${name(e.debtorId)} owes ${name(e.creditorId)} ${usd}`,
      zIndex: on ? 1 : 0,
      data: {
        bend: spoke ? 0 : BEND,
        color: COLOR[tone],
        width: width(e.amountCents),
        opacity: e.amountCents > 0 ? (dim ? 0.45 : 1) : 0,
        marker: `url(#${uid}-${tone})`,
        label: spoke ? `${owe ? "You owe" : "Owes you"} ${usd}` : usd,
        labelColor: spoke || on ? COLOR[tone] : "#003087",
      },
    };
  });

  for (const l of links) {
    const a = spot.get(l.from)!;
    const b = spot.get(l.to)!;
    // Bend away from the ring centre (0, 0): the sign of the chord normal against the chord middle.
    const out = (a.y - b.y) * (a.x + b.x) + (b.x - a.x) * (a.y + b.y) >= 0;
    flowEdges.push({
      id: `private:${l.from}>${l.to}`,
      source: l.from,
      target: l.to,
      type: "link",
      ariaLabel: privateText(l.hidden),
      data: { bend: out ? 0.3 : -0.3, color: COLOR.private, width: 1.5, opacity: 1, dash: "2 5" },
    });
  }

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
      {/* Arrow heads in screen pixels (userSpaceOnUse), so they do not grow with the stroke width. */}
      <svg aria-hidden="true" className="network-defs">
        <defs>
          {Object.entries(COLOR).map(([tone, color]) => (
            <marker
              key={tone}
              id={`${uid}-${tone}`}
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth={ARROW}
              markerHeight={ARROW}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
      </svg>
      <ReactFlow
        key={middle ?? HOUSE}
        aria-label={label}
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
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
        {links.map((l) => (
          <li key={`private:${l.from}>${l.to}`}>{`${privateText(l.hidden)} between ${name(l.from)} and ${name(l.to)}`}</li>
        ))}
      </ul>
    </div>
  );
}
