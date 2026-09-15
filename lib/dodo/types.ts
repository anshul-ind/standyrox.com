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
