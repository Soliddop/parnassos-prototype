// ---------------------------------------------------------------------------
// PLACEHOLDER DATA — NOT THE CLUB'S REAL SCHEDULE.
//
// The source document "ΣΤΟΙΧΕΙΑ ΔΙΑΔΡΟΜΩΝ για site τελικο.docx" publishes only
// a season per trail ("όλο το έτος", "Μάρτιος - Δεκέμβριος", ...), never a
// specific departure date, and parnassoshiking.gr publishes none either.
//
// Every date, time, capacity and seat count below is therefore GENERATED, and
// is flagged as such by `DEPARTURES_ARE_PLACEHOLDER` so the UI can say so out
// loud. Do not present any of it to a visitor as fact.
//
// What IS real and is read from `trails.ts` rather than invented:
//   - the season window each trail runs in  (`Trail.season`)
//   - the adult and child price             (`Trail.price`)
//
// When the client supplies the real schedule, replace `departures` with the
// literal list, set `DEPARTURES_ARE_PLACEHOLDER` to false, and delete the
// generator below. Nothing outside this file needs to change.
// ---------------------------------------------------------------------------

import { trails, type Trail } from "./trails";

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

/**
 * Flip to false only when `departures` holds the client's real schedule.
 *
 * The booking UI used to carry a visible "ενδεικτικές ημερομηνίες" warning
 * driven by this flag. That warning was removed on request, so nothing on the
 * page now tells a visitor these dates are generated. This flag and the file
 * header are the only remaining record — keep them accurate.
 */
export const DEPARTURES_ARE_PLACEHOLDER = true;

/** Every placeholder departure is sized the same; real capacities are unknown. */
const PLACEHOLDER_CAPACITY = 15;

/** How far ahead the generated window runs, in whole months. */
const WINDOW_MONTHS = 6;

// --- season -----------------------------------------------------------------

const GREEK_MONTHS = [
  "ιανουαρ", "φεβρουαρ", "μαρτ", "απριλ", "μα", "ιουν",
  "ιουλ", "αυγουστ", "σεπτεμβρ", "οκτωβρ", "νοεμβρ", "δεκεμβρ",
];

/** Strip accents so "Μάρτιος" and "Μαρτίου" both match "μαρτ". */
function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Read `Trail.season` into the 1-based months the trail runs in.
 * Handles "όλο το έτος", "Μάρτιος - Δεκέμβριος" and "από Απρίλιο έως Νοέμβριο".
 */
export function seasonMonths(season: string): number[] {
  const text = fold(season);
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (text.includes("ολο το ετος")) return all;

  const found: number[] = [];
  // Walk the string so "Μάιος - Νοέμβριος" keeps its first/last order.
  for (const word of text.split(/[^\p{L}]+/u).filter(Boolean)) {
    const index = GREEK_MONTHS.findIndex((stem) => word.startsWith(stem));
    if (index >= 0) found.push(index + 1);
  }
  if (found.length < 2) return all;

  const [from, to] = [found[0], found[found.length - 1]];
  return all.filter((m) => (from <= to ? m >= from && m <= to : m >= from || m <= to));
}

// --- price ------------------------------------------------------------------

/**
 * Read `Trail.price` into cents. The two published shapes are
 * "20€/άτομο (ανήλικοι 10€)" and "20€/άτομο (10€ ανήλικα)"; "Δωρεάν" is 0.
 */
export function parsePrice(price: string): { adult: number; child?: number } {
  if (fold(price).includes("δωρεαν")) return { adult: 0, child: 0 };
  const figures = [...price.matchAll(/([\d.,]+)\s*€/g)].map((m) =>
    Math.round(parseFloat(m[1].replace(/\./g, "").replace(",", ".")) * 100),
  );
  if (!figures.length) return { adult: 0 };
  return { adult: figures[0], child: figures[1] };
}

// --- Athens wall-clock ------------------------------------------------------

/** Last Sunday of a 0-based month, as a day of the month. */
function lastSunday(year: number, month0: number): number {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/**
 * Athens UTC offset for a calendar day: +03:00 during EEST, +02:00 otherwise.
 * Day-level precision is enough — no departure starts near the 03:00 switch.
 */
function athensOffset(year: number, month1: number, day: number): "+02:00" | "+03:00" {
  if (month1 < 3 || month1 > 10) return "+02:00";
  if (month1 > 3 && month1 < 10) return "+03:00";
  if (month1 === 3) return day >= lastSunday(year, 2) ? "+03:00" : "+02:00";
  return day < lastSunday(year, 9) ? "+03:00" : "+02:00";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-05T09:00:00+03:00" from a calendar day and a wall-clock time. */
function athensIso(year: number, month1: number, day: number, time: string): string {
  return `${year}-${pad(month1)}-${pad(day)}T${time}:00${athensOffset(year, month1, day)}`;
}

// --- generator --------------------------------------------------------------

/** Small deterministic hash, so a rebuild produces identical seat counts. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Read the leading figure of `Trail.duration` into hours. The published shapes
 * are "2h 30min", "45min (1h 30min με επιστροφή)" and "1.15h (2.30h ...)", so a
 * bare parseFloat would read "45min" as 45 hours.
 */
function durationHours(duration: string): number {
  const asHours = duration.match(/^\s*([\d.]+)\s*h/);
  if (asHours) return parseFloat(asHours[1]);
  const asMinutes = duration.match(/^\s*([\d.]+)\s*min/);
  if (asMinutes) return parseFloat(asMinutes[1]) / 60;
  return 2;
}

/** Departures run at weekends; the long climbs start earlier in the day. */
function scheduleFor(trail: Trail): { weekdays: number[]; times: string[]; nights: number } {
  const hours = durationHours(trail.duration);
  if (trail.slug === "diimero-amfikleia-delfoi") {
    return { weekdays: [6], times: ["08:00"], nights: 1 };
  }
  if (hours >= 4) return { weekdays: [0, 6], times: ["08:00"], nights: 0 };
  return { weekdays: [0, 6], times: ["09:00", "15:00"], nights: 0 };
}

/**
 * Build the placeholder window: WINDOW_MONTHS months from the first of the
 * month the site is built in, so a prototype build never shows stale dates.
 */
function generate(today: Date): Departure[] {
  const out: Departure[] = [];

  for (const trail of trails) {
    const months = seasonMonths(trail.season);
    const { adult, child } = parsePrice(trail.price);
    const { weekdays, times, nights } = scheduleFor(trail);

    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + WINDOW_MONTHS, 1));

    for (; cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const year = cursor.getUTCFullYear();
      const month1 = cursor.getUTCMonth() + 1;
      const day = cursor.getUTCDate();

      if (cursor.getTime() <= today.getTime()) continue;      // future only
      if (!months.includes(month1)) continue;                  // inside season
      if (!weekdays.includes(cursor.getUTCDay())) continue;     // weekend

      for (const time of times) {
        const id = `${trail.slug}-${year}${pad(month1)}${pad(day)}-${time.replace(":", "")}`;
        const roll = hash(id) % 10;
        const soldout = roll === 0;
        const seatsLeft = soldout
          ? 0
          : roll < 3
            ? 1 + (hash(id + "s") % 5)                          // scarce: 1-5
            : 6 + (hash(id + "s") % (PLACEHOLDER_CAPACITY - 5)); // comfortable

        const endDay = new Date(Date.UTC(year, month1 - 1, day + nights));

        out.push({
          id,
          trailSlug: trail.slug,
          startsAt: athensIso(year, month1, day, time),
          endsAt: nights
            ? athensIso(
                endDay.getUTCFullYear(),
                endDay.getUTCMonth() + 1,
                endDay.getUTCDate(),
                "18:00",
              )
            : undefined,
          capacity: PLACEHOLDER_CAPACITY,
          seatsLeft,
          priceCents: adult,
          childPriceCents: child,
          status: soldout ? "soldout" : "open",
        });
      }
    }
  }

  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Placeholder departures, ordered by start time. See the file header. */
export const departures: Departure[] = generate(new Date());
