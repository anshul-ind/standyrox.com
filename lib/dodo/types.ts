// ─── Dodo event types ────────────────────────────────────────────────────────
// NOTE: The exact webhook payload shape (event.data.metadata.order_id etc.)
// must be confirmed from a real fired test event (Sprint 5 Step 8/9). These
// types and the extractors below are intentionally defensive about the shape
// and log the raw event so the real field paths can be pinned down.

export type DodoEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.cancelled"
  | "payment.processing";

export interface DodoWebhookEventData {
  [key: string]: unknown;
  metadata?: Record<string, string | number | boolean>;
  payment_id?: string;
  id?: string;
}

export interface DodoWebhookEvent {
  type: string;
  event_type?: string;
  id?: string;
  event_id?: string;
  data?: DodoWebhookEventData;
  [key: string]: unknown;
}

/** Top-level shape of a Dodo webhook delivery. */
export interface DodoRawEvent {
  type?: string;
  id?: string;
  data?: DodoWebhookEventData;
  created_at?: string | number;
  [key: string]: unknown;
}

// ─── Shape-safe extractors ───────────────────────────────────────────────────
function asRecord(v: unknown): Record<string, string | number | boolean> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, string | number | boolean>)
    : {};
}

/**
 * Pull the event type out of a Dodo webhook event however it is wrapped.
 * Supports both `{ type: "payment.succeeded", ... }` and
 * `{ data: { type: "...", ... } }` shapes.
 */
export function extractEventType(raw: DodoRawEvent): string | null {
  if (typeof raw.type === "string" && raw.type) return raw.type;
  const nested = asRecord(raw.data);
  if (typeof nested.type === "string" && nested.type) return nested.type;
  return null;
}

/**
 * Pull order_id from the event. The metadata object is the expected home
 * (`data.metadata.order_id`) since we set it at session creation, but we also
 * fall back to top-level `data.order_id` for resilience against shape drift.
 */
export function extractOrderId(raw: DodoRawEvent): string | null {
  const data = asRecord(raw.data);
  const meta = asRecord(data.metadata);
  const candidates = [meta.order_id, data.order_id];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/**
 * Pull spot_id from the event metadata we set at session creation. Used purely
 * as a cross-check against the order's stored zone; the order row stays the
 * authoritative source of truth for which spot was purchased.
 */
export function extractSpotId(raw: DodoRawEvent): string | null {
  const data = asRecord(raw.data);
  const meta = asRecord(data.metadata);
  const spotId = meta.spot_id ?? data.spot_id;
  return typeof spotId === "string" && spotId.length > 0 ? spotId : null;
}

/**
 * Pull the checkout session id from the event. Used as a fallback to locate the
 * order when the metadata order_id is somehow absent, by matching the
 * `external_payment_id` we stored on the order at checkout time.
 *
 * Verified shape: a payment.succeeded event carries `data.checkout_session_id`.
 */
export function extractCheckoutSessionId(raw: DodoRawEvent): string | null {
  const data = asRecord(raw.data);
  const candidates = [data.checkout_session_id, data.session_id];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/**
 * Pull the amount actually charged, in the currency's smallest unit.
 * Verified shape: `data.total_amount` on a payment event.
 */
export function extractTotalAmount(raw: DodoRawEvent): number | null {
  const data = asRecord(raw.data);
  const value = data.total_amount ?? data.amount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Pull the payment currency (ISO 4217), if present. */
export function extractCurrency(raw: DodoRawEvent): string | null {
  const data = asRecord(raw.data);
  const value = data.currency;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pull the provider payment id used for idempotency. Tries several realistic
 * field names and logs what was found so the real shape can be confirmed.
 */
export function extractPaymentId(raw: DodoRawEvent): string | null {
  const data = asRecord(raw.data);
  const payment = asRecord(data.payment);
  const candidates = [
    data.payment_id,
    data.id,
    typeof raw.id === "string" ? raw.id : null,
    payment.payment_id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}
