import { env } from "@/lib/env";
import {
  DodoConfigError,
  extractStatusCode,
  getDodoDiagnostics,
  getDodoClient,
} from "./client";

export interface CreateCheckoutSessionInput {
  /** Server-validated Dodo product ID for the selected spot. */
  productId: string;
  orderId: string;
  /** Ad-zone id, carried in metadata so the webhook can correlate the spot. */
  spotId: string;
  email: string;
  name?: string | null;
}

export interface CheckoutSessionResult {
  sessionId: string;
  /** Redirect the buyer here to complete payment. */
  checkoutUrl: string;
}

/** Thrown when Dodo rejects our credentials (HTTP 401). Never carries the key. */
export class DodoAuthError extends Error {
  code = "DODO_AUTH_FAILED";
  dodoEnvironment: string;
  keyConfigured: boolean;
  constructor(dodoEnvironment: string, keyConfigured: boolean) {
    super(
      `Dodo Payments authentication failed (401) in ${dodoEnvironment}. ` +
        "The API key is rejected for this environment — check that a test key is " +
        "paired with test_mode and a live key with live_mode, that the Production " +
        "env var is set (not only Preview/Development), and redeploy after fixing. " +
        "Run GET /api/payments/dodo/status?probe=1 to confirm which environment the " +
        "configured key is actually accepted in."
    );
    this.name = "DodoAuthError";
    this.dodoEnvironment = dodoEnvironment;
    this.keyConfigured = keyConfigured;
  }
}

/**
 * Create a Dodo hosted checkout session for an ad-zone placement.
 *
 * The caller MUST pass a product ID it has already validated against the
 * spot→product mapping — this function never chooses a product itself, so a
 * client can never influence which product is charged.
 *
 * Field names verified directly against the installed SDK's
 * `resources/checkout-sessions.d.ts` (v2.50.0):
 *   create() -> CheckoutSessionResponse with `session_id` and `checkout_url`.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CheckoutSessionResult> {
  const productId = input.productId.trim();
  if (!productId) {
    throw new DodoConfigError(
      "No Dodo product ID was resolved for this spot. Refusing to create a checkout with a fallback product."
    );
  }

  // The order id rides in the return_url because Dodo appends only ITS OWN
  // parameters to it (`payment_id`, `status`, `email` — never our session id).
  // Without it the success page cannot tell which order the buyer just paid, so
  // nothing gets claimed from the return trip.
  const returnUrl =
    `${env.NEXT_PUBLIC_APP_URL}/checkout/success` +
    `?order_id=${encodeURIComponent(input.orderId)}`;

  let session;
  try {
    session = await getDodoClient().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: input.email, name: input.name ?? null },
      return_url: returnUrl,
      metadata: { order_id: input.orderId, spot_id: input.spotId },
    });
  } catch (err) {
    throw normalizeDodoError(err);
  }

  const checkoutUrl = session.checkout_url;
  if (!checkoutUrl) {
    throw new Error(
      "Dodo did not return a hosted checkout_url for this session"
    );
  }

  return { sessionId: session.session_id, checkoutUrl };
}

/**
 * Map SDK/HTTP failures to actionable errors.
 * A 401 is ALWAYS an auth/config problem (wrong key, wrong environment,
 * missing Production env var, stale build) — never a buyer input problem.
 * Inspects only status codes / error names; never logs or returns secrets.
 */
function normalizeDodoError(err: unknown): unknown {
  const diag = getDodoDiagnostics();
  const status = extractStatusCode(err);
  const name = err instanceof Error ? err.name : "";

  if (status === 401 || name === "AuthenticationError") {
    console.error(
      `[DodoPayments] 401 from ${diag.baseUrl} environment=${diag.environment} ` +
        `keyConfigured=${diag.keyConfigured} keyClass=${diag.keyClass} ` +
        `source=${diag.envVarSource}. Not retrying — fix credentials/environment and redeploy ` +
        "(GET /api/payments/dodo/status?probe=1 says whether the key is accepted in this environment)."
    );
    return new DodoAuthError(diag.environment, diag.keyConfigured);
  }

  return err;
}

