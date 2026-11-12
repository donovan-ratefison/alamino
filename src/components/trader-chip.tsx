import { HOUSE, type TraderId, type Viewer } from "@/lib/types";

// One fixed colour for each trader, the same on every screen.
// ponytail: five seed traders have a chosen colour; any other id gets one from a hash of the id.
const COLORS: Record<string, string> = { hery: "#0070e0", soa: "#b4236b", rivo: "#9a5b00", lalao: "#0a7d4f", fidy: "#5b3fc4" };
const SPARE = ["#0e7490", "#7c2d12", "#3f6212", "#6b21a8", "#be123c"];

export function traderColor(id: TraderId): string {
  if (COLORS[id]) return COLORS[id];
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[hash % SPARE.length];
}

// A round badge with the trader's initial. `name` is the display name. The initial is decorative:
// put the name next to the chip, or pass `label` to give the chip an accessible name of its own.
// The clearing house (id HOUSE) gets a brand blue chip with a bank icon.
export function TraderChip({ id, name, size = 28, label }: { id: Viewer; name: string; size?: number; label?: string }) {
  const house = id === HOUSE;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: house ? "#003087" : traderColor(id) }}
    >
      {house ? (
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5 12 4l9 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18" />
        </svg>
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
