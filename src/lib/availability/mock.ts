// Mock availability source: reads the placeholder schedule in
// `src/data/departures.ts`. Used until WooCommerce is wired up in Phase 5.
//
// It is deliberately async even though the data is local, so the calendar is
// written against the same call shape a real HTTP source will need.

import { departures } from "../../data/departures";
import type { AvailabilitySource } from "./index";
import { buildEnquiryUrl } from "./checkout";
import { dayKey } from "./dates";

export const mockSource: AvailabilitySource = {
  async listDepartures(trailSlug, from, to) {
    // Compare as "YYYY-MM-DD" strings so the window edges do not shift with
    // the caller's timezone. See the note in dates.ts.
    const fromKey = from.toISOString().slice(0, 10);
    const toKey = to.toISOString().slice(0, 10);
    return departures.filter(
      (d) =>
        d.trailSlug === trailSlug &&
        d.status !== "cancelled" &&
        dayKey(d.startsAt) >= fromKey &&
        dayKey(d.startsAt) <= toKey,
    );
  },

  buildCheckoutUrl: buildEnquiryUrl,
};
