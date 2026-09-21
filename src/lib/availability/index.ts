// The one seam between the booking UI and whatever actually holds the
// schedule. The booking card imports `availability` from here and nothing
// else, so swapping the mock for WooCommerce is a one-line change in this
// file — see the Phase 5 field-mapping note in plan.md.

import type { Departure } from "../../data/departures";
import type { Selection } from "./checkout";
import { mockSource } from "./mock";

export type { Departure, Selection };

export interface AvailabilitySource {
  listDepartures(trailSlug: string, from: Date, to: Date): Promise<Departure[]>;
  buildCheckoutUrl(sel: Selection): string;
}

/** Active source. Phase 5 swaps this for the WooCommerce implementation. */
export const availability: AvailabilitySource = mockSource;
