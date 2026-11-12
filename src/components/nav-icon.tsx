import type { SVGProps } from "react";

export type NavIconName = "market" | "add" | "confirm" | "payments" | "statement" | "finance" | "help" | "back" | "next" | "close";

export function NavIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: NavIconName }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {name === "market" && <><path d="m3 9 2-5h14l2 5M4 13v7h16v-7M9 20v-6h6v6" /><path d="M3 9v1a3 3 0 0 0 6 0V9v1a3 3 0 0 0 6 0V9v1a3 3 0 0 0 6 0V9M9 4l-1 5m7-5 1 5" /></>}
      {name === "add" && <><path d="M8 5 6 8H3v12h18V8h-3l-2-3z" /><circle cx="12" cy="13" r="3.5" /></>}
      {name === "confirm" && <><path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>}
      {name === "payments" && <><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></>}
      {name === "statement" && <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5" /></>}
      {name === "finance" && <path d="M3 20h18M6 16v-4m5 4V6m5 10v-7m4 7V9" />}
      {name === "help" && <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1 .6-1.7 1.1-1.7 2.7" /><path d="M12 17h.01" /></>}
      {name === "back" && <path d="m15 18-6-6 6-6" />}
      {name === "next" && <path d="m9 18 6-6-6-6" />}
      {name === "close" && <path d="M18 6 6 18M6 6l12 12" />}
    </svg>
  );
}
