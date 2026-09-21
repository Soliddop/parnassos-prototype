// The one place the booking selection lives.
//
// The calendar, the party-size stepper, the card CTA and the sticky dock all
// read from here instead of writing to each other. The previous code spliced
// query strings onto the CTA href from inside the picker, which stops working
// as soon as a second control (party size) can also change the link.
//
// The selection is mirrored into the URL as ?date=&dep=&adults=&children=, so
// a chosen departure is shareable, survives a reload, and hands WooCommerce
// the same values later.

export interface BookingState {
  day: string | null;          // "2026-10-05"
  departureId: string | null;
  adults: number;
  children: number;
}

type Listener = (state: BookingState) => void;

const DEFAULTS: BookingState = { day: null, departureId: null, adults: 1, children: 0 };

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createBookingState(): {
  get(): BookingState;
  set(patch: Partial<BookingState>): void;
  subscribe(listener: Listener): void;
} {
  const params = new URLSearchParams(window.location.search);
  const day = params.get("date");

  let state: BookingState = {
    ...DEFAULTS,
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    departureId: params.get("dep"),
    adults: clampInt(params.get("adults"), 1, 30, DEFAULTS.adults),
    children: clampInt(params.get("children"), 0, 30, DEFAULTS.children),
  };

  const listeners: Listener[] = [];

  const writeUrl = () => {
    const url = new URL(window.location.href);
    const next = url.searchParams;
    for (const key of ["date", "dep", "adults", "children"]) next.delete(key);
    if (state.day) next.set("date", state.day);
    if (state.departureId) next.set("dep", state.departureId);
    if (state.departureId) {
      next.set("adults", String(state.adults));
      if (state.children > 0) next.set("children", String(state.children));
    }
    // replaceState, not pushState: picking a date should not fill the Back
    // button with a history entry for every click.
    window.history.replaceState(null, "", url.toString());
  };

  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if (
        next.day === state.day &&
        next.departureId === state.departureId &&
        next.adults === state.adults &&
        next.children === state.children
      ) return;
      state = next;
      writeUrl();
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.push(listener);
      listener(state);
    },
  };
}
