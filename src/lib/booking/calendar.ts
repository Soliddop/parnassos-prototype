// Client controller for the booking calendar.
//
// Owns four things and nothing else: which month is on screen, which day is
// picked, which departure is picked, and the party size. Everything it needs
// to know about the schedule arrives in the build-time JSON payload, so the
// static build makes no network call. When WooCommerce goes live the payload
// is filled by a fetch through the same adapter and this file is untouched.

import { createBookingState } from "./state";
import { byDay, renderMonth, type CalDeparture, type CalendarPayload } from "./grid";
import {
  formatDayCompact, formatDayFull, formatDayShort, formatMonth, formatParty, formatPrice, shiftDay,
} from "../availability/dates";
import { buildEnquiryUrl } from "../availability/checkout";

const DESKTOP = "(min-width: 1025px)";

const q = <T extends HTMLElement>(root: ParentNode, name: string) =>
  root.querySelector<T>(`[data-cal-${name}]`);

export function initBookingCalendar(root: HTMLElement): void {
  const payloadTag = q<HTMLScriptElement>(root, "payload");
  if (!payloadTag?.textContent) return;

  const payload: CalendarPayload = JSON.parse(payloadTag.textContent);
  if (!payload.departures.length) return;

  const grid = q(root, "grid");
  const monthLabel = q(root, "month");
  const prev = q<HTMLButtonElement>(root, "prev");
  const next = q<HTMLButtonElement>(root, "next");
  const live = q(root, "live");
  const depsBox = q(root, "deps");
  const party = q<HTMLFieldSetElement>(root, "party");
  const totalBox = q(root, "total");
  const hint = q(root, "hint");
  const sheet = q<HTMLDialogElement>(root, "sheet");
  const trigger = q<HTMLButtonElement>(root, "trigger");
  const triggerLabel = q(root, "trigger-label");
  const closeBtn = q<HTMLButtonElement>(root, "close");
  if (!grid || !monthLabel || !prev || !next || !live || !depsBox || !party || !hint) return;

  // Both the card CTA and the sticky dock CTA carry [data-book].
  const ctas = [...document.querySelectorAll<HTMLAnchorElement>("[data-book]")];
  // The sticky dock repeats the card's summary once the card scrolls away, so
  // it has to carry enough to decide on: what is booked, for whom, for how much.
  const dockMeta = document.querySelector<HTMLElement>("[data-dock-meta]");
  const dockPrice = document.querySelector<HTMLElement>("[data-dock-price]");
  const dockNote = document.querySelector<HTMLElement>("[data-dock-note]");
  const dockParty = document.querySelector<HTMLElement>("[data-dock-party]");
  const dockDefaults = {
    meta: dockMeta?.textContent ?? "",
    price: dockPrice?.textContent ?? "",
    note: dockNote?.textContent ?? "",
  };

  const grouped = byDay(payload.departures);
  const byId = new Map(payload.departures.map((d) => [d.id, d]));
  /** Days with at least one bookable departure, ascending. Sold-out days are
   *  shown in the grid but are not keyboard-navigable targets. */
  const openDays = [...grouped.entries()]
    .filter(([, list]) => list.some((d) => d.status === "open"))
    .map(([day]) => day)
    .sort();

  const state = createBookingState();
  let viewMonth = payload.months.includes(state.get().day?.slice(0, 7) ?? "")
    ? state.get().day!.slice(0, 7)
    : payload.initialMonth;

  // --- helpers --------------------------------------------------------------

  const monthDepartures = (month: string) =>
    payload.departures.filter((d) => d.day.startsWith(month));

  const selectedDeparture = (): CalDeparture | null => {
    const id = state.get().departureId;
    return id ? byId.get(id) ?? null : null;
  };

  /** Nearest bookable day at or after `day`, else the last one before it. */
  const snap = (day: string, forward: boolean): string | null => {
    if (forward) return openDays.find((d) => d >= day) ?? openDays.at(-1) ?? null;
    return [...openDays].reverse().find((d) => d <= day) ?? openDays[0] ?? null;
  };

  const announce = (message: string) => {
    live.textContent = message;
  };

  // --- grid -----------------------------------------------------------------

  function drawGrid(focusDay: string | null, moveFocus: boolean) {
    grid!.innerHTML = renderMonth(
      viewMonth,
      monthDepartures(viewMonth),
      state.get().day,
      focusDay,
    );
    monthLabel!.textContent = formatMonth(viewMonth);

    const index = payload.months.indexOf(viewMonth);
    // The published window is not contiguous: a trail can run in September and
    // November but not October. Stepping through `months` skips the empty ones
    // instead of making the visitor click through blank grids.
    prev!.disabled = index <= 0;
    next!.disabled = index < 0 || index >= payload.months.length - 1;

    if (moveFocus && focusDay) {
      grid!.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
    }
  }

  function goToMonth(month: string, focusDay: string | null) {
    if (!payload.months.includes(month)) return;
    viewMonth = month;
    drawGrid(focusDay, Boolean(focusDay));
    announce(formatMonth(viewMonth));
  }

  /** Move the keyboard focus to `day`, flipping the month if it falls outside. */
  function focusDay(day: string | null) {
    if (!day) return;
    const month = day.slice(0, 7);
    if (month !== viewMonth && payload.months.includes(month)) {
      viewMonth = month;
      announce(formatMonth(viewMonth));
    }
    drawGrid(day, true);
  }

  // --- selection ------------------------------------------------------------

  function pickDay(day: string) {
    const list = (grouped.get(day) ?? []).filter((d) => d.status === "open");
    // A date with exactly one departure selects it outright; making the
    // visitor confirm a list of one is a click that teaches nothing.
    const only = list.length === 1 ? list[0].id : null;
    state.set({ day, departureId: only });
    announce(
      only
        ? `${formatDayFull(day)}. Μία αναχώρηση, επιλέχθηκε αυτόματα στις ${list[0].time}.`
        : `${formatDayFull(day)}. ${list.length} αναχωρήσεις, επιλέξτε ώρα.`,
    );
    closeSheet();
    // Closing the desktop flyout drops the focus on <body>, because the day
    // button that held it is gone. Hand it to the next thing to decide: the
    // time, when the day has more than one departure, else the trigger.
    if (desktop.matches) {
      (depsBox!.querySelector<HTMLInputElement>("input[type=radio]:not(:disabled)") ??
        trigger)?.focus();
    }
  }

  function drawDepartures() {
    const { day, departureId } = state.get();
    const list = day ? grouped.get(day) ?? [] : [];
    if (!day || !list.length) {
      depsBox!.hidden = true;
      depsBox!.innerHTML = "";
      return;
    }

    depsBox!.hidden = false;
    depsBox!.innerHTML =
      `<fieldset class="deps"><legend class="deps__legend visually-hidden">${formatDayFull(day)}</legend>` +
      list
        .map((d) => {
          const soldout = d.status === "soldout";
          // Honest scarcity: the number is real and only shown when it is low.
          const seats = soldout
            ? "Εξαντλήθηκε"
            : d.seatsLeft <= 5
              ? `Απομένουν ${d.seatsLeft} ${d.seatsLeft === 1 ? "θέση" : "θέσεις"}`
              : `${d.seatsLeft} διαθέσιμες θέσεις`;
          const nights = d.endsDay ? " · Διήμερο" : "";
          return (
            `<label class="dep${soldout ? " dep--soldout" : ""}">` +
            `<input type="radio" name="departure" value="${d.id}"` +
            `${soldout ? " disabled" : ""}${d.id === departureId ? " checked" : ""}>` +
            `<span class="dep__body"><span class="dep__time">${d.time}${nights}</span>` +
            `<span class="dep__seats">${seats}</span></span>` +
            `<span class="dep__price">${formatPrice(d.priceCents)}</span></label>`
          );
        })
        .join("") +
      `</fieldset>`;
  }

  // --- party size and total -------------------------------------------------

  const adultsOut = q(party, "adults-value");
  const childrenOut = q(party, "children-value");
  const childRow = q(party, "children-row");

  function clampParty() {
    const departure = selectedDeparture();
    const max = departure ? departure.seatsLeft : 1;
    let { adults, children } = state.get();
    adults = Math.max(1, Math.min(adults, max));
    children = Math.max(0, Math.min(children, max - adults));
    if (departure && departure.childPriceCents === undefined) children = 0;
    state.set({ adults, children });
  }

  function drawParty() {
    const departure = selectedDeparture();
    const { adults, children } = state.get();
    party!.disabled = !departure;
    if (adultsOut) adultsOut.textContent = String(adults);
    if (childrenOut) childrenOut.textContent = String(children);

    // Some trails publish no child price; offering the stepper would invent one.
    const noChildPrice = Boolean(departure) && departure!.childPriceCents === undefined;
    if (childRow) childRow.hidden = noChildPrice;

    const max = departure?.seatsLeft ?? 1;
    party!.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((button) => {
      const field = button.dataset.field as "adults" | "children";
      const delta = Number(button.dataset.step);
      const value = field === "adults" ? adults : children;
      const low = field === "adults" ? 1 : 0;
      button.disabled =
        !departure ||
        (delta < 0 && value <= low) ||
        (delta > 0 && adults + children >= max);
    });

    if (!totalBox) return;
    if (!departure) {
      totalBox.hidden = true;
      return;
    }
    const cents = adults * departure.priceCents + children * (departure.childPriceCents ?? 0);
    totalBox.hidden = false;
    totalBox.innerHTML =
      `<span>Σύνολο</span><strong>${formatPrice(cents)}</strong>`;
  }

  // --- call to action -------------------------------------------------------

  function drawCta() {
    const departure = selectedDeparture();
    const { adults, children } = state.get();

    for (const cta of ctas) {
      if (departure) {
        cta.href = buildEnquiryUrl({
          departureId: departure.id,
          trailSlug: payload.trailSlug,
          day: departure.day,
          adults,
          children,
        });
        cta.removeAttribute("aria-disabled");
        cta.classList.remove("is-disabled");
      } else {
        cta.href = `${cta.dataset.baseHref}`;
        cta.setAttribute("aria-disabled", "true");
        cta.classList.add("is-disabled");
      }
    }

    hint!.hidden = Boolean(departure);
    if (triggerLabel) {
      triggerLabel.textContent = state.get().day
        ? formatDayCompact(state.get().day!)
        : "Δείτε τις διαθέσιμες ημερομηνίες";
    }
    trigger?.classList.toggle("is-chosen", Boolean(state.get().day));
    const cents = departure
      ? adults * departure.priceCents + children * (departure.childPriceCents ?? 0)
      : 0;
    if (dockMeta) {
      dockMeta.textContent = departure
        ? `${formatDayShort(departure.day)} · ${departure.time}`
        : dockDefaults.meta;
    }
    // Its own element, because the narrow dock hides it in CSS.
    if (dockParty) {
      dockParty.textContent = departure ? ` · ${formatParty(adults, children)}` : "";
    }
    if (dockPrice) dockPrice.textContent = departure ? formatPrice(cents) : dockDefaults.price;
    if (dockNote) dockNote.textContent = departure ? "σύνολο" : dockDefaults.note;
  }

  // A disabled anchor still has an href for no-JS users, so block the click.
  for (const cta of ctas) {
    cta.addEventListener("click", (event) => {
      if (cta.getAttribute("aria-disabled") !== "true") return;
      event.preventDefault();
      hint!.hidden = false;
      trigger?.focus();
      announce("Επιλέξτε πρώτα ημερομηνία και ώρα αναχώρησης.");
    });
  }

  // --- events ---------------------------------------------------------------

  grid.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-day]");
    if (!button || button.disabled) return;
    pickDay(button.dataset.day!);
  });

  grid.addEventListener("keydown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-day]");
    if (!button) return;
    const day = button.dataset.day!;
    const index = openDays.indexOf(day);

    // Arrows step between bookable days only. Days with no departure render as
    // natively disabled buttons, so there is nothing to land on in between.
    let target: string | null = null;
    switch (event.key) {
      case "ArrowRight": target = openDays[index + 1] ?? null; break;
      case "ArrowLeft":  target = openDays[index - 1] ?? null; break;
      case "ArrowDown":  target = snap(shiftDay(day, 7), true); break;
      case "ArrowUp":    target = snap(shiftDay(day, -7), false); break;
      case "Home":       target = openDays.find((d) => d.startsWith(viewMonth)) ?? null; break;
      case "End":        target = [...openDays].reverse().find((d) => d.startsWith(viewMonth)) ?? null; break;
      case "PageUp":     target = snap(shiftDay(day, event.shiftKey ? -365 : -28), false); break;
      case "PageDown":   target = snap(shiftDay(day, event.shiftKey ? 365 : 28), true); break;
      default: return;
    }
    event.preventDefault();
    focusDay(target);
  });

  prev.addEventListener("click", () => goToMonth(payload.months[payload.months.indexOf(viewMonth) - 1], null));
  next.addEventListener("click", () => goToMonth(payload.months[payload.months.indexOf(viewMonth) + 1], null));

  depsBox.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "departure") return;
    state.set({ departureId: input.value });
    const departure = byId.get(input.value);
    if (departure) announce(`Επιλέχθηκε αναχώρηση ${departure.time}.`);
  });

  party.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-step]");
    if (!button || button.disabled) return;
    const field = button.dataset.field as "adults" | "children";
    const delta = Number(button.dataset.step);
    state.set({ [field]: state.get()[field] + delta } as never);
    clampParty();
  });

  // --- desktop flyout vs mobile sheet ---------------------------------------

  // Both modes use the same <dialog>. On desktop it is shown as a popover, so
  // it lands in the top layer and escapes the booking card's `overflow: auto`;
  // on mobile `showModal()` gives the focus trap, Esc-to-close and focus
  // return. Only one of the two may be showing at a time, which is why every
  // mode switch closes the other first.
  const desktop = window.matchMedia(DESKTOP);

  const flyoutOpen = () => Boolean(sheet?.matches(":popover-open"));

  function closeSheet() {
    if (!sheet) return;
    if (flyoutOpen()) sheet.hidePopover();
    else if (sheet.open) sheet.close();
  }

  /** Park the flyout under the trigger, flipping above it when the window is
   *  too short. The popover is in the top layer, so these are viewport
   *  coordinates and no ancestor offset comes into it. */
  function placeFlyout() {
    if (!sheet || !trigger || !flyoutOpen()) return;
    const edge = 12;
    const gap = 8;
    const anchor = trigger.getBoundingClientRect();
    const width = sheet.offsetWidth;
    const height = sheet.offsetHeight;

    // Right-aligned with the trigger, so the flyout opens over the page rather
    // than off the right edge next to a sidebar card.
    const left = Math.min(
      Math.max(edge, anchor.right - width),
      window.innerWidth - width - edge,
    );

    let top = anchor.bottom + gap;
    if (top + height > window.innerHeight - edge) {
      const above = anchor.top - gap - height;
      top = above >= edge ? above : Math.max(edge, window.innerHeight - height - edge);
    }

    sheet.style.left = `${left}px`;
    sheet.style.top = `${top}px`;
  }

  if (sheet && trigger) {
    const applyMode = () => {
      closeSheet();
      if (desktop.matches) sheet.setAttribute("popover", "auto");
      else sheet.removeAttribute("popover");
    };

    // Light dismiss closes an open popover on pointerdown, before the click
    // reaches this handler. Without the guard, clicking the trigger to close
    // the flyout would immediately reopen it.
    let closedAt = 0;

    trigger.addEventListener("click", () => {
      if (!desktop.matches) {
        sheet.showModal();
        return;
      }
      if (flyoutOpen()) sheet.hidePopover();
      else if (performance.now() - closedAt > 200) sheet.showPopover();
    });

    closeBtn?.addEventListener("click", () => closeSheet());

    sheet.addEventListener("click", (event) => {
      if (event.target === sheet && sheet.open) sheet.close();   // modal backdrop
    });

    // `beforetoggle` fires synchronously, `toggle` does not — so the close has
    // to be stamped here, while the dismissing pointerdown is still running.
    sheet.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState === "open") requestAnimationFrame(placeFlyout);
      else closedAt = performance.now();
    });
    sheet.addEventListener("toggle", (event) => {
      const open = (event as ToggleEvent).newState === "open";
      trigger.setAttribute("aria-expanded", String(open));
      if (open) {
        placeFlyout();
        // Land the keyboard on the grid, not on the month arrows.
        grid!.querySelector<HTMLButtonElement>("[data-day]:not(:disabled)")?.focus();
      } else {
        sheet.style.removeProperty("left");
        sheet.style.removeProperty("top");
      }
    });

    window.addEventListener("scroll", placeFlyout, { passive: true, capture: true });
    window.addEventListener("resize", placeFlyout);
    desktop.addEventListener("change", applyMode);
    applyMode();
  }

  // --- boot -----------------------------------------------------------------

  state.subscribe(() => {
    drawGrid(state.get().day, false);
    drawDepartures();
    drawParty();
    drawCta();
  });

  // Restore a shared or reloaded URL, dropping anything that no longer exists.
  const restored = state.get();
  const validDay = restored.day && grouped.has(restored.day) ? restored.day : null;
  const validDep =
    restored.departureId && byId.get(restored.departureId)?.day === validDay
      ? restored.departureId
      : null;
  state.set({ day: validDay, departureId: validDep });
  clampParty();
  drawGrid(validDay, false);
  drawDepartures();
  drawParty();
  drawCta();
}
