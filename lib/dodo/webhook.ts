import { Webhook } from "standardwebhooks";

import { env } from "@/lib/env";
import type { DodoRawEvent } from "./types";

export interface DodoWebhookHeaders {
  "webhook-id"?: string | null;
  "webhook-timestamp"?: string | null;
  "webhook-signature"?: string | null;
  [key: string]: string | string[] | undefined | null;
}

const webhook = new Webhook(env.DODO_PAYMENTS_WEBHOOK_SECRET);

/**
 * Verify a Dodo webhook signature over the exact raw request body.
 *
 * Throws (WebhookVerificationError from `standardwebhooks`) when the signature
 * is invalid — deliberately NOT swallowed here. The route handler catches it
 * and returns 400. The `standardwebhooks` verify() with `jsonParse: false`
 * verifies the signature only and returns the raw payload, so JSON parsing is
 * kept separate.
 */
export function verifyDodoWebhook(
  rawBody: string,
  headers: DodoWebhookHeaders
): DodoRawEvent {
  const signedHeaders = {
    "webhook-id": headers["webhook-id"] ?? "",
    "webhook-signature": headers["webhook-signature"] ?? "",
    "webhook-timestamp": headers["webhook-timestamp"] ?? "",
  };

  const payload = webhook.verify(rawBody, signedHeaders, {
    jsonParse: false,
  });

  // standardwebhooks returns the raw payload string when jsonParse is false.
  return JSON.parse(String(payload)) as DodoRawEvent;
}
