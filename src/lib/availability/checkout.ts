// Checkout hand-off URL. Kept in its own module with no data import, because
// the browser needs this function and must not drag the whole departure list
// into the page bundle with it.

export interface Selection {
  departureId: string;
  trailSlug: string;
  day: string;          // "2026-10-05"
  adults: number;
  children: number;
}

/** Where an unbooked enquiry lands. Built in Phase 4. */
export const ENQUIRY_PATH = "/epikoinonia";

/** Phase 5 replaces this with the WooCommerce add-to-cart URL. */
export function buildEnquiryUrl({ departureId, trailSlug, day, adults, children }: Selection): string {
  const params = new URLSearchParams({
    trail: trailSlug,
    date: day,
    dep: departureId,
    adults: String(adults),
  });
  if (children > 0) params.set("children", String(children));
  return `${ENQUIRY_PATH}?${params}`;
}
