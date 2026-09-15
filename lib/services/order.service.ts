import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

export type OrderStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";

/** Shape of an orders row as produced by Drizzle. */
export interface OrderRow {
  id: string;
  zoneId: string;
  buyerEmail: string;
  buyerName: string | null;
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  externalPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  zoneId: string;
  buyerEmail: string;
  brandName: string;
  brandUrl?: string | null;
  brandLogoUrl?: string | null;
  amountCents: number;
  currency?: string;
}

/** Insert a pending order. Amount is always server-authoritative. */
export async function createOrder(
  input: CreateOrderInput
): Promise<OrderRow> {
  const [row] = await db
    .insert(orders)
    .values({
      zoneId: input.zoneId,
      buyerEmail: input.buyerEmail,
      brandName: input.brandName,
      brandUrl: input.brandUrl ?? null,
      brandLogoUrl: input.brandLogoUrl ?? null,
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      status: "pending",
    })
    .returning();

  if (!row) throw new Error("Failed to create order");
  return row as OrderRow;
}

export async function getOrderById(id: string): Promise<OrderRow | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  return (rows[0] as OrderRow | undefined) ?? null;
}

export async function getOrderByExternalPaymentId(
  externalPaymentId: string
): Promise<OrderRow | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.externalPaymentId, externalPaymentId))
    .limit(1);
  return (rows[0] as OrderRow | undefined) ?? null;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<void> {
  await db.update(orders).set({ status }).where(eq(orders.id, id));
}

export async function setOrderExternalPaymentId(
  id: string,
  externalPaymentId: string
): Promise<void> {
  await db
    .update(orders)
    .set({ externalPaymentId })
    .where(eq(orders.id, id));
}
