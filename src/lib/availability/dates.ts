// Date helpers shared by the build-time payload and the client calendar.
//
// Rule from the plan: compare days as "YYYY-MM-DD" strings, never by building
// `new Date(y, m, d)` on the client. A visitor in London must see the same day
// highlighted as a visitor in Athens, and a Date built from local parts would
// shift it. Every `Departure.startsAt` carries an explicit Athens offset, so
// the first ten characters are already the Athens wall-clock day.

/** "2026-10-05T09:00:00+03:00" -> "2026-10-05" (Athens wall-clock day). */
export function dayKey(startsAt: string): string {
  return startsAt.slice(0, 10);
}

/** "2026-10-05T09:00:00+03:00" -> "09:00" (Athens wall-clock time). */
export function timeKey(startsAt: string): string {
  return startsAt.slice(11, 16);
}

/** Shift a "YYYY-MM" key by whole months, without touching local time. */
export function addMonths(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Days in a "YYYY-MM" month. Uses UTC, so no local-time drift. */
export function daysInMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of the 1st of a "YYYY-MM" month, 0 = Monday (Greek week start). */
export function firstWeekdayMondayBased(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** "2026-10" + 5 -> "2026-10-05" */
export function dayKeyOf(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

const EL = "el-GR";

/** "2026-10" -> "Οκτώβριος 2026" */
export function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(EL, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "2026-10-05" -> "5 Οκτωβρίου" */
export function formatDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(EL, { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

/** "2026-10-05" -> "Κυριακή 5 Οκτωβρίου 2026" */
export function formatDayFull(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(EL, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Monday-first weekday headers: Δε, Τρ, Τε, Πε, Πα, Σα, Κυ. */
export function weekdayHeaders(): { short: string; long: string }[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.UTC(2024, 0, 1 + i));
    return {
      short: new Intl.DateTimeFormat(EL, { weekday: "short", timeZone: "UTC" }).format(date),
      long: new Intl.DateTimeFormat(EL, { weekday: "long", timeZone: "UTC" }).format(date),
    };
  });
}

/** Cents -> "20 €" / "20,50 €" / "Δωρεάν". */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Δωρεάν";
  return new Intl.NumberFormat(EL, {
    style: "currency", currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Shift a "YYYY-MM-DD" key by whole days. UTC arithmetic — no local drift. */
export function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return shifted.toISOString().slice(0, 10);
}

/**
 * "2026-10-05" -> "Σάβ 5 Οκτ 2026" — the compact form for the calendar trigger.
 *
 * The full form wraps to two lines in the 270px sidebar. This one holds a
 * single line and keeps the year, which matters because the calendar reaches
 * about six months ahead and can cross into the next one.
 */
export function formatDayCompact(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(EL, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "2026-10-05" -> "Σάβ 10 Οκτ" — the compact form for the sticky dock. */
export function formatDayShort(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(EL, {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "2 ενήλικες, 1 ανήλικος" — Greek singular/plural, children omitted at 0. */
export function formatParty(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? "ενήλικας" : "ενήλικες"}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? "ανήλικος" : "ανήλικοι"}`);
  return parts.join(", ");
}
