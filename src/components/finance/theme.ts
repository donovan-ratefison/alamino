import { themeQuartz } from "ag-grid-community";

// Shared with the market ledger; does not import AG Studio into the market page.
export const financeGridTheme = themeQuartz.withParams({
  accentColor: "#0070e0",
  backgroundColor: "#ffffff",
  foregroundColor: "#052969",
  borderColor: "#dce5f2",
  headerBackgroundColor: "#f3f8ff",
  headerTextColor: "#003087",
  headerFontWeight: 500,
  fontFamily: "var(--font-inter), Arial, sans-serif",
  fontSize: 13,
  rowHeight: 46,
  headerHeight: 48,
  wrapperBorderRadius: 12,
  rowHoverColor: "#eff6ff",
});
