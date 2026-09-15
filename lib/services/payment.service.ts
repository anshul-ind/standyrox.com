import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { payments } from "@/lib/db/schema";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface CreatePaymentInput {
  orderId: string;
  provider: string;
  providerPaymentId?: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  rawEvent?: unknown;
}

/** Record a payment row. Returns the created row. */
export async function createPayment(
  input: CreatePaymentInput
): Promise<void> {
  await db.insert(payments).values({
    orderId: input.orderId,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId ?? null,
    amountCents: input.amountCents,
    currency: input.currency,
    status: input.status,
    rawEvent: input.rawEvent === undefined ? null : input.rawEvent,
  });
}

/**
 * Idempotency guard — returns true when a payment row already exists for this
 * order + provider payment id, so a re-delivered webhook is not double-processed.
 */
export async function paymentAlreadyRecorded(
  orderId: string,
  providerPaymentId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.orderId, orderId),
        eq(payments.providerPaymentId, providerPaymentId)
      )
    )
    .limit(1);
  return rows.length > 0;
}
