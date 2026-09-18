import { env } from "@/lib/env";
import {
  DodoConfigError,
  getDodoDiagnostics,
  getDodoClient,
} from "./client";

export interface CreateCheckoutSessionInput {
  orderId: string;
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
        "env var is set (not only Preview/Development), and redeploy after fixing."
    );
    this.name = "DodoAuthError";
    this.dodoEnvironment = dodoEnvironment;
    this.keyConfigured = keyConfigured;
  }
}

/**
 * Create a Dodo hosted checkout session for an ad-zone placement.
 *
 * Field names verified directly against the installed SDK's
 * `resources/checkout-sessions.d.ts` (v2.50.0):
 *   create() -> CheckoutSessionResponse with `session_id` and `checkout_url`.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CheckoutSessionResult> {
  let productId: string;
  try {
    productId = env.DODO_AD_ZONE_PRODUCT_ID;
  } catch {
    throw new DodoConfigError(
      "DODO_AD_ZONE_PRODUCT_ID is not configured. Set it in the deployment Production environment and redeploy."
    );
  }

  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/checkout/success`;

  let session;
  try {
    session = await getDodoClient().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: input.email, name: input.name ?? null },
      return_url: returnUrl,
      metadata: { order_id: input.orderId },
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
        `source=${diag.envVarSource}. Not retrying — fix credentials/environment and redeploy.`
    );
    return new DodoAuthError(diag.environment, diag.keyConfigured);
  }

  return err;
}

function extractStatusCode(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const rec = err as Record<string, unknown>;
    if (typeof rec.status === "number") return rec.status;
    if (typeof rec.statusCode === "number") return rec.statusCode;
    // Stainless SDK errors nest the HTTP status in several shapes.
    const error = rec.error as Record<string, unknown> | undefined;
    if (error && typeof error.statusCode === "number")
      return error.statusCode as number;
    // Some Stainless builds expose status only on the message, e.g. "401 ...".
    if (err instanceof Error) {
      const m = err.message.match(/\b(401|403|404|409|422|429|5\d\d)\b/);
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}

