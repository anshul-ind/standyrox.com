import DodoPayments from "dodopayments";

import { env } from "@/lib/env";

// Singleton client. Keys come exclusively from lib/env.ts — never hardcode
// credentials in this file.
let client: DodoPayments | null = null;

export function getDodoClient(): DodoPayments {
  if (client) return client;

  client = new DodoPayments({
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
  });

  return client;
}
