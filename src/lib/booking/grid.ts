// One source of truth for the calendar grid markup.
//
// Astro renders the opening month at build time with `renderMonth`, and the
// client script calls the same function when the visitor changes month. If the
// markup lived in two places it would drift, and the keyboard and ARIA wiring
// would drift with it.

import {
  dayKey, dayKeyOf, daysInMonth, firstWeekdayMondayBased,
  formatDay, formatMonth, timeKey, weekdayHeaders,
} from "../availability/dates";
import type { Departure } from "../availability";

/** The departure fields the calendar needs, flattened for the page payload. */
export interface CalDeparture {
  id: string;
  day: string;          // "2026-10-05", Athens wall-clock
  time: string;         // "09:00", Athens wall-clock
  endsDay?: string;     // set on multi-day trails
  capacity: number;
  seatsLeft: number;
  priceCents: number;
  childPriceCents?: number;
  status: "open" | "soldout";
}

export interface CalendarPayload {
  trailSlug: string;
  months: string[];     // every "YYYY-MM" with at least one departure, ascending
  initialMonth: string; // the first of those — never today's empty month
  departures: CalDeparture[];
}

/** Flatten departures for the page payload, dropping cancelled ones. */
export function toPayload(trailSlug: string, source: Departure[]): CalendarPayload {
  const departures: CalDeparture[] = source
    .filter((d) => d.status !== "cancelled")
    .map((d) => ({
      id: d.id,
      day: dayKey(d.startsAt),
      time: timeKey(d.startsAt),
      endsDay: d.endsAt ? dayKey(d.endsAt) : undefined,
      capacity: d.capacity,
      seatsLeft: d.seatsLeft,
      priceCents: d.priceCents,
      childPriceCents: d.childPriceCents,
      status: d.status === "soldout" ? "soldout" : "open",
    }))
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

  const months = [...new Set(departures.map((d) => d.day.slice(0, 7)))].sort();

  return { trailSlug, months, initialMonth: months[0] ?? "", departures };
}

/** Group departures by their "YYYY-MM-DD" day. */
export function byDay(departures: CalDeparture[]): Map<string, CalDeparture[]> {
  const map = new Map<string, CalDeparture[]>();
  for (const d of departures) {
    const list = map.get(d.day);
    if (list) list.push(d);
    else map.set(d.day, [d]);
  }
  return map;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** "2 αναχωρήσεις, 4 θέσεις" / "1 αναχώρηση, εξαντλήθηκε" */
function dayDescription(list: CalDeparture[]): string {
  const open = list.filter((d) => d.status === "open");
  const count = list.length === 1 ? "1 αναχώρηση" : `${list.length} αναχωρήσεις`;
  if (!open.length) return `${count}, εξαντλήθηκε`;
  const seats = open.reduce((sum, d) => sum + d.seatsLeft, 0);
  return `${count}, ${seats === 1 ? "1 θέση" : `${seats} θέσεις`}`;
}

/**
 * Render one month as a `role="grid"` table.
 *
 * `selectedDay` gets `aria-pressed="true"`. `focusDay` is the single day that
 * carries `tabindex="0"` — the roving tabindex the grid pattern requires. If
 * `focusDay` names no bookable day, the first bookable day takes the tab stop
 * instead, so the grid is never unreachable by keyboard.
 */
export function renderMonth(
  monthKey: string,
  departures: CalDeparture[],
  selectedDay: string | null,
  focusDay: string | null,
): string {
  const grouped = byDay(departures);
  const total = daysInMonth(monthKey);
  const lead = firstWeekdayMondayBased(monthKey);

  const bookable: string[] = [];
  for (let day = 1; day <= total; day++) {
    const key = dayKeyOf(monthKey, day);
    if (grouped.get(key)?.some((d) => d.status === "open")) bookable.push(key);
  }
  const tabStop = focusDay && bookable.includes(focusDay) ? focusDay : bookable[0] ?? null;

  const cells: string[] = [];
  for (let i = 0; i < lead; i++) cells.push('<td class="cal__pad"></td>');

  for (let day = 1; day <= total; day++) {
    const key = dayKeyOf(monthKey, day);
    const list = grouped.get(key) ?? [];
    const soldout = list.length > 0 && list.every((d) => d.status === "soldout");
    const open = list.some((d) => d.status === "open");

    if (!list.length) {
      cells.push(
        `<td role="gridcell"><button type="button" class="cal__day" disabled tabindex="-1"` +
          ` aria-label="${escapeAttr(`${formatDay(key)}, χωρίς αναχώρηση`)}">` +
          `<span class="cal__num">${day}</span></button></td>`,
      );
      continue;
    }

    const label = `${formatDay(key)}, ${dayDescription(list)}`;
    const classes = ["cal__day", soldout ? "is-soldout" : "is-open"].join(" ");
    const disabled = open ? "" : " disabled";
    const tabindex = open && key === tabStop ? "0" : "-1";

    cells.push(
      `<td role="gridcell"><button type="button" class="${classes}" data-day="${key}"` +
        `${disabled} tabindex="${tabindex}" aria-pressed="${key === selectedDay}"` +
        ` aria-label="${escapeAttr(label)}">` +
        `<span class="cal__num">${day}</span>` +
        `<span class="cal__dot" aria-hidden="true"></span></button></td>`,
    );
  }

  while (cells.length % 7) cells.push('<td class="cal__pad"></td>');

  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  }

  const head = weekdayHeaders()
    .map((d) => `<th scope="col" abbr="${escapeAttr(d.long)}"><span aria-hidden="true">${d.short}</span>` +
      `<span class="visually-hidden">${d.long}</span></th>`)
    .join("");

  return (
    `<table class="cal__grid" role="grid" aria-label="${escapeAttr(formatMonth(monthKey))}">` +
    `<thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`
  );
}
