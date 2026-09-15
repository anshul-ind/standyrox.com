
import { PLACEMENT_DURATION_MS } from "@/lib/constants";
import { db } from "@/lib/db";
import { placements } from "@/lib/db/schema";

export interface CreatePlacementInput {
  zoneId: string;
  orderId: string;
  brandName: string;
  brandUrl?: string | null;
  brandLogoUrl?: string | null;
  startsAt?: Date;
  endsAt?: Date;
}

/**
 * Create an active placement for a paid order. Times default to now / now + 30
 * days. `placements.zone_id` is UNIQUE, so only one active placement can exist
 * per zone.
 */
export async function createActivePlacement(
  input: CreatePlacementInput
): Promise<void> {
  const startsAt = input.startsAt ?? new Date();
  const endsAt =
    input.endsAt ?? new Date(startsAt.getTime() + PLACEMENT_DURATION_MS);

  await db.insert(placements).values({
    zoneId: input.zoneId,
    orderId: input.orderId,
    status: "active",
    brandName: input.brandName,
    brandUrl: input.brandUrl ?? null,
    brandLogoUrl: input.brandLogoUrl ?? null,
    startsAt,
    endsAt,
  });
}
