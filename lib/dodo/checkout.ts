import { env } from "@/lib/env";
import { getDodoClient } from "./client";

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
  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/checkout/success`;

  const session = await getDodoClient().checkoutSessions.create({
    product_cart: [{ product_id: env.DODO_AD_ZONE_PRODUCT_ID, quantity: 1 }],
    customer: { email: input.email, name: input.name ?? null },
    return_url: returnUrl,
    metadata: { order_id: input.orderId },
  });

  const checkoutUrl = session.checkout_url;
  if (!checkoutUrl) {
    throw new Error(
      "Dodo did not return a hosted checkout_url for this session"
    );
  }

  return { sessionId: session.session_id, checkoutUrl };
}
