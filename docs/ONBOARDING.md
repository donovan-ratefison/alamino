# Guided tour and illustrated help

The first visit opens an eight-step Driver.js overview, except on **Add a debt**, which opens its own six-step guide directly on the capture controls. The overview introduces the market, capture, confirmations, payments, statements, demo trader switch and replay button. Desktop navigation and the phone bottom bar share visible targets. Tours never change debts, start clearing, or initiate payments.

Closing or finishing the tour saves `alamino.onboarding.v1` in this browser. Use **Take a guided tour** in the desktop header or **More** on a phone to replay it. To preview the first visit again, remove only this local-storage entry using browser developer tools, or open a private window. No account or payment data needs to be reset.

**Add a debt** has no static illustration panel. Its **Guide** button replays a six-step tour of the trader selector, camera, photo picker, sentence field, read button, and review/save instructions. The sentence field is revealed on phones so it can be highlighted; existing text is preserved. This tour has its own browser preference, `alamino.onboarding.add.v1`, and closes when capture begins or the page is left. The illustration appears inside the relevant popover only.

The other four core screens have illustrated tips with expandable instructions. All illustrations use the same woman guide in different poses. The phone bar keeps its central camera shortcut and shows an SVG icon and a visible label for all five destinations, including **Payments**.

## Image assets

Generated with the built-in image_gen tool using a character reference for each pose. Transparent backgrounds are preserved. Files were optimised to WebP with Sharp, without changing the illustrations. The six assets total approximately 237 KB. No external image service is needed at runtime.

- `public/illustrations/alamino-guide.webp`: welcome / presenting the app.
- `public/illustrations/guide-market.webp`: explaining connected traders.
- `public/illustrations/guide-add.webp`: photographing a notebook.
- `public/illustrations/guide-confirm.webp`: approving a debt.
- `public/illustrations/guide-payments.webp`: explaining pay-ins and payouts.
- `public/illustrations/guide-statement.webp`: reading a statement.

## Generation prompts

### Character and welcome illustration

Professional premium SaaS onboarding guide illustration for Alamino, a blue-and-white finance web application. A single welcoming adult Malagasy woman acting as a helpful product guide, dressed in a simple cobalt-blue jacket over a white shirt, dark navy trousers, short natural curly hair, warm understated smile, standing at the left with one open palm elegantly presenting three abstract floating interface cards to the right. The cards contain only a minimal notebook pictogram, an approval checkmark, and two connecting payment arrows, with no letters, numbers or currency signs. Modern restrained flat vector-style editorial illustration: precise clean geometric shapes, simple rounded anatomy, confident thin navy outlines, completely flat solid color fills, lots of open negative space, sophisticated FinTech visual language. Palette strictly cobalt #0070e0, navy #003087, pale sky blue #d9ecff and white, with natural warm brown skin tones. No painterly texture, no gouache, no photographic rendering, no 3D, no gradients, no atmospheric glow, no elaborate patterns, no group of people, no decorative plants, no hat, no text, no brand logos, no watermark. Compact balanced landscape composition around 3:2. Full figure and complete interface cards must fit comfortably inside the frame. Genuinely transparent background. Designed to fit cleanly inside a white guided tour welcome popover and remain legible at 280 pixels wide.

### Shared pose instructions

Create one new pose of the SAME professional woman guide shown in the reference image. Preserve her exact identity: warm brown skin, short dark curly hair, small white earrings, cobalt-blue blazer over a white shirt, navy trousers, and navy flats. Preserve the polished, simple flat vector-style illustration and proportions. The reference is a character and visual-style reference; replace the three interface cards with the single element described below. Full figure fits comfortably in a compact balanced landscape 3:2 composition with generous transparent margins. Friendly confident understated expression, natural anatomically correct hands. Solid blue #0070e0, navy #003087, pale blue and white palette with natural skin tones. Genuinely transparent background, no environmental scene, no shadows, no gradients, no glow, no textures, no text, no numbers, no currency signs, no brands, no watermark.

### market

Pose: she stands on the LEFT, turned three quarters towards the viewer, one open palm pointing to a small clean diagram to her right of THREE connected blue circular nodes with thin arrows. Her other hand rests naturally by her side. This explains the shared market and connected traders.

### add

Pose: she stands facing three quarters RIGHT, holding an open small navy notebook in one hand, and a blue smartphone in the other hand angled towards the notebook as if taking a clear photo of it. Her face remains visible with an encouraging smile. A tiny simple camera symbol may appear next to the phone. This explains photographing a notebook to add a debt. No other floating interface cards.

### confirm

Pose: the same woman faces the viewer at a gentle three-quarter angle, holding a simple small white approval card with one large blue checkmark at chest level in her LEFT hand; with her RIGHT hand she makes a natural subtle thumbs-up. Friendly reassuring face. No other interface cards. This explains reviewing and confirming a debt.

### payments

Pose: the same woman stands to the RIGHT of two clean opposing horizontal arrows inside a small white rounded card at chest level, one cobalt arrow pointing right and one navy arrow pointing left. She presents the card with one open palm and points to one arrow with the other hand. Reassuring, no urgency. This explains the remaining payments and payouts after clearing.

### statement

Pose: the same woman stands three quarters turned to the LEFT, holding a single white financial statement sheet in one hand. The paper shows only three short blue horizontal lines and small checkmarks, NO writing or numbers. She points gently to a line on the paper with the other hand, as if explaining the result to the viewer. This explains reading a settlement statement.

## Validation

`npm run typecheck`, `npm run lint`, `npm test` and `npm run e2e`. The tour-specific Playwright tests use fresh browser storage and cover first visits, all eight steps, illustrated assets, dismissal, persistence, desktop and mobile replay, phone navigation, and no changes to debts or payment APIs. Existing journey tests model a returning visitor using a completed-tour browser state.

Official references: [installation](https://driverjs.com/docs/installation), [configuration](https://driverjs.com/docs/configuration).
