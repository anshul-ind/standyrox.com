// ─── Reservation TTL ─────────────────────────────────────────────────────────
/** How long a zone stays "reserved" before a still-pending order is expired. */
export const RESERVATION_TTL_MINUTES = 10;
export const RESERVATION_TTL_MS = RESERVATION_TTL_MINUTES * 60 * 1000;

// ─── Placement lifecycle ─────────────────────────────────────────────────────
/** Legacy / active placement duration (30 days). */
export const PLACEMENT_DURATION_DAYS = 30;
export const PLACEMENT_DURATION_MS = PLACEMENT_DURATION_DAYS * 24 * 60 * 60 * 1000;

// ─── Payment provider ────────────────────────────────────────────────────────
export const PAYMENT_PROVIDER_DODO = "dodo";
