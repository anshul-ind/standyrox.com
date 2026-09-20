import { Webhook } from "standardwebhooks";

import type { DodoRawEvent } from "./types";

export interface DodoWebhookHeaders {
  "webhook-id"?: string | null;
  "webhook-timestamp"?: string | null;
  "webhook-signature"?: string | null;
  [key: string]: string | string[] | undefined | null;
}

export function getWebhookSecret(): string {
  const secret = (
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET ??
    process.env.DODO_WEBHOOK_SECRET ??
    ""
  ).trim();
  if (!secret) {
    console.error("❌ [DodoWebhook] Missing webhook secret (DODO_PAYMENTS_WEBHOOK_SECRET or DODO_WEBHOOK_SECRET)!");
    throw new Error("[DodoWebhook] Missing Dodo Webhook Secret");
  }
  return secret;
}

/**
 * Verify a Dodo webhook signature over the exact raw request body.
 *
 * Throws (WebhookVerificationError from `standardwebhooks`) when the signature
 * is invalid — deliberately NOT swallowed here. The route handler catches it
 * and returns 400.
 *
 * IMPORTANT: in `standardwebhooks` v1.1 `verify(..., { jsonParse: false })`
 * returns `undefined` on a VALID signature (it only signals "signature ok"); it
 * does NOT return the raw payload string. The previous code parsed that
 * `undefined` and threw, so every genuine webhook was rejected as
 * "Invalid signature" — which is why successful payments never claimed the
 * spot or rendered the logo. We verify the signature, then parse the raw body
 * ourselves.
 */
export function verifyDodoWebhook(
  rawBody: string,
  headers: DodoWebhookHeaders
): DodoRawEvent {
  const webhook = new Webhook(getWebhookSecret());

  const signedHeaders = {
    "webhook-id": headers["webhook-id"] ?? "",
    "webhook-signature": headers["webhook-signature"] ?? "",
    "webhook-timestamp": headers["webhook-timestamp"] ?? "",
  };

  // Throws WebhookVerificationError on an invalid/expired signature.
  webhook.verify(rawBody, signedHeaders, { jsonParse: false });

  // Parse the verified raw body ourselves (see note above).
  return JSON.parse(rawBody) as DodoRawEvent;
}
