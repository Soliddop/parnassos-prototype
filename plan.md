# Plan: replace the sidebar picker with a real departure calendar

Status: approved, not started. Written 2026-09-11.
Target component: `src/components/BookingCard.astro` (the sidebar on `src/pages/diadromes/[slug].astro`).

## Decisions already made

| Question | Answer |
| --- | --- |
| Booking model | **Fixed departures.** The club publishes specific dates per trail. The calendar enables only those dates. |
| WooCommerce integration | **Not decided yet.** Build against a swappable availability adapter with mock data, wire the real backend later without touching the UI. |
| WooCommerce plugin | **Unknown.** Design the data contract the site needs; match the plugin to it later. |

## What is broken today

The control in the sidebar is labelled "Επιλέξτε ημερομηνία" but it contains no dates. It opens a list of six times — 09:00, 10:00, 14:00, 15:00, 18:00, 19:00 — grouped as Πρωί / Απόγευμα / Βράδυ. A customer who wants to book a specific Saturday cannot express that.

Two further problems in the same component:

- Those six times are invented. The comment at `src/components/BookingCard.astro:15` says so directly: they come from a Figma frame and are "Not present in the trail document or on the live site." They are shown to a visitor as real departures.
- The booking button points at `/epikoinonia`, which does not exist in `src/pages/`. Every "Κάντε κράτηση" click today is a 404.

The sidebar is not a datepicker that needs polish. It is a placeholder that needs replacing.

---

## 1. Data layer

New file `src/data/departures.ts`:

```ts
export interface Departure {
  id: string;            // stable; later maps to a Woo product or variation id
  trailSlug: string;
  startsAt: string;      // "2026-10-05T09:00:00+03:00" — explicit Athens offset
  endsAt?: string;       // multi-day trails (διήμερο Αμφίκλεια–Δελφοί)
  capacity: number;
  seatsLeft: number;
  priceCents: number;    // adult
  childPriceCents?: number;
  status: "open" | "soldout" | "cancelled";
  meetingPoint?: string;
}
```

**The real schedule is needed from the client.** If it is not available, generate clearly-labelled placeholder dates, marked as placeholder in the file and in the UI. Do not repeat the current mistake of presenting invented times as fact.

## 2. Availability adapter

New file `src/lib/availability/index.ts`:

```ts
export interface AvailabilitySource {
  listDepartures(trailSlug: string, from: Date, to: Date): Promise<Departure[]>;
  buildCheckoutUrl(sel: { departureId: string; adults: number; children: number }): string;
}
```

Two implementations, one interface:

- `mock.ts` — reads `departures.ts`. Used now.
- `woocommerce.ts` — written in Phase 5. The calendar never imports it directly.

This is what defers the WooCommerce decision. Once a plugin is chosen, write a field-mapping table (departure id → product or variation id, `seatsLeft` → stock quantity, `priceCents` → regular price, `startsAt` → booking start or product meta) and implement one file. The UI does not change.

## 3. The calendar — UX decisions

**Inline month grid on desktop, bottom sheet on mobile.** The sidebar card is sticky and roughly 360px wide, which fits a month grid. A dropdown that overlays a sticky card is worse than showing the grid outright. Below 1024px the card goes static and full-width, so a permanently open calendar would push the trail description far down the page. There, a trigger button opens the same grid in a real `<dialog>` bottom sheet.

**Open on the first month that has a departure, not on today.** If the next departure is in November, opening on September makes the user click "next" twice through empty grids.

**Disable the prev/next buttons at the edges** of the published window. No scrolling into infinite empty months.

**Only real departures are clickable.** Days without one render as natively disabled buttons — still in the grid so the layout holds, but not focusable and not clickable. Days with departures carry a dot marker and a full accessible name: "5 Οκτωβρίου, 2 αναχωρήσεις, 4 θέσεις".

**Sold-out dates stay visible, struck through and disabled.** Hiding them tells the customer the trail does not run. Showing them tells the customer it is popular and to book earlier.

**Picking a date reveals that date's departures below the grid** as a radio group of cards — time, duration, seats left, price — not anonymous time pills. If a date has exactly one departure, auto-select it and say so.

**Honest scarcity.** "Απομένουν 3 θέσεις" appears only when `seatsLeft <= 5` and the number is real.

**A real empty state.** A trail with no upcoming departures shows no calendar at all. It shows "Δεν υπάρχουν προγραμματισμένες αναχωρήσεις" and an enquiry CTA. The current UI implies availability that may not exist.

**Party size stepper** (ενήλικες / ανήλικοι), clamped at `seatsLeft`, with a live total. Clamping at input time stops a checkout that WooCommerce would reject.

**The CTA stays disabled until a departure is chosen**, with a visible hint line rather than a silently dead button. Wire the hint to the button with `aria-describedby`.

## 4. Accessibility

Hand-rolled date pickers fail here more than anywhere else, so this is specified rather than assumed. Follow the WAI-ARIA date-picker grid pattern.

- A real `<table role="grid">` with `<th scope="col">` weekday headers, buttons inside cells.
- Roving tabindex: exactly one day button is tabbable at a time.
- Keyboard: arrows move by day, Up/Down by week, PageUp/PageDown by month, Shift+PageUp/Down by year, Home/End to the week edges. Arrowing past a month boundary flips the month and keeps focus on the day.
- An `aria-live="polite"` region announces the month on change and the result on selection.
- The mobile sheet is a native `<dialog>`, which gives the focus trap, Esc-to-close and focus return for free.
- Touch targets at least 44x44 CSS px, including calendar cells on small phones.
- Honour `prefers-reduced-motion` for the month transition and the sheet, matching the existing pattern in the file.
- Contrast fix carried over: `.picker__trigger` currently uses `#717171` on `#f9fafb`, about 4.3:1, which fails WCAG AA for normal text. Move it to `--c-dove-gray` or darker.

## 5. Dates and locale — the quiet bugs

- Format with `Intl.DateTimeFormat("el-GR")`. Week starts Monday.
- Compare dates as `YYYY-MM-DD` strings. Never construct `new Date(y, m, d)` on the client for comparison. This avoids the off-by-one where a visitor in another timezone sees the wrong day highlighted.
- Store wall-clock local time with an explicit Athens offset, so a 09:00 departure stays 09:00 across the March and October DST switches.

## 6. State and Astro specifics

- One small `BookingState` module (trail, departureId, adults, children) with subscribers. The card, the calendar and the sticky dock all read from it. The current code splices strings onto the CTA `href`, which will not survive party size and date.
- Mirror the selection into the URL: `?date=2026-10-05&dep=abc&adults=2`. A chosen departure becomes shareable and survives a reload, and WooCommerce later receives the same values.
- Bake departures into the page at build time as a `<script type="application/json">` payload, so the static build works with zero fetch. When WooCommerce goes live, that payload is replaced by a runtime fetch through the same adapter. The prototype and the production version share one code path.
- No framework. This stays an Astro component with a module script, like the rest of the repo. If the client logic passes roughly 300 lines, raise adding a single Preact island rather than adding a dependency pre-emptively.
- `<noscript>` fallback: the next six departures as a plain list of links, so the page is still bookable without JS.

## 7. Phases

| Phase | Work | Blocked on |
| --- | --- | --- |
| 1 | `departures.ts`, adapter interface, mock source | The real schedule, or approval to use labelled placeholders |
| 2 | Calendar component: grid, keyboard, empty and sold-out states, desktop inline + mobile sheet | — |
| 3 | Party size, live total, CTA enablement, dock sync, URL state | — |
| 4 | Checkout hand-off behind the adapter; build the missing `/epikoinonia` enquiry page | — |
| 5 | WooCommerce field mapping, then `woocommerce.ts` | Plugin choice |

Screenshot desktop and mobile at the end of Phase 2 and Phase 3, and look at the PNGs, before reporting either phase done.

## What this plan does not solve

- **No seat locking.** Two customers can both pick the last seat. Only WooCommerce's cart can truly reserve one. Until Phase 5, `seatsLeft` is advisory.
- **No payment, no confirmation email, no cancellation flow.** Those live in WooCommerce.
- **The build is static.** If the headless Store API route is chosen later, the site needs an SSR adapter. Phase 5 is where that decision becomes unavoidable.
- **Content is still missing.** Real departure dates, real capacities and the child-price rules are not in `src/data/trails.ts` or in the source document `ΣΤΟΙΧΕΙΑ ΔΙΑΔΡΟΜΩΝ για site τελικο.docx`.

## Open questions for the next session

1. Is there a real departure schedule, or should Phase 1 use clearly-labelled placeholder dates?
2. Run Phases 1-3 in one go, or section by section with approval between each?
