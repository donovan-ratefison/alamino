# Alamino blue and white theme

The supplied editorial theme is adapted to blue and white, following the user's
colour clarification. Storytelling bands use solid PayPal-inspired blue rather
than black. The existing Alamino logo is retained in the header and footer.

| Token | Value | Use |
| --- | --- | --- |
| Accent / bright blue | `#0070e0` | Hero bands, primary actions, chart series |
| Brand blue | `#003087` | Logo, headings, active tabs, footer |
| Deep ink | `#052969` | Body and financial values |
| Canvas | `#ffffff` | Main content and cards |
| Soft blue | `#eff6ff` | Inputs, navigation and supporting surfaces |
| Hairline | `#dce5f2` | Borders and dividers |

Inter Variable is self-hosted through `next/font/local`. Its SIL Open Font License
is included at `public/fonts/Inter-LICENSE.txt`. No proprietary display font or
external font service is needed. Display headings use medium weight, tight
tracking and responsive sizes. Buttons are pills, cards have 20px corners and
inputs have 12px corners. Semantic payment/error states retain text labels and
their functional colours.

Shared controls live in `src/components/ui.tsx`; colour and layout tokens live in
`src/app/globals.css`. `Brand` reuses the PNG without recolouring it. AG Grid has
a shared blue/white theme; AG Studio has its own matching theme and chart palette.
The Studio import remains confined to its dynamically loaded component.

Full-width blue bands use the main element's inline-size container, avoiding
viewport-scrollbar overflow. Content is limited to 1200px plus side padding.
The six routes are checked at desktop, tablet and narrow mobile widths; financial
data, APIs and payment behaviour are retained.
