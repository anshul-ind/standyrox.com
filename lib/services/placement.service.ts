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
 * Create (or replace) the active placement for a paid order. Times default to
 * now / now + 30 days. `placements.zone_id` is UNIQUE, so a zone holds at most
 * one placement row — the current one.
 *
 * Idempotent, and re-claimable: the conflict target UPDATES the existing row
 * instead of doing nothing. The old `onConflictDoNothing` meant that once a
 * spot had ever been claimed, every later claim of that same spot was silently
 * skipped — the zone flipped to `occupied` but the placement row kept pointing
 * at the stale order, so the logo never rendered (exactly what made re-testing
 * a spot impossible). A duplicate delivery of the SAME order writes the same
 * values, so it stays a no-op.
 */
export async function createActivePlacement(
  input: CreatePlacementInput
): Promise<void> {
  const startsAt = input.startsAt ?? new Date();
  const endsAt =
    input.endsAt ?? new Date(startsAt.getTime() + PLACEMENT_DURATION_MS);

  const values = {
    zoneId: input.zoneId,
    orderId: input.orderId,
    status: "active" as const,
    brandName: input.brandName,
    brandUrl: input.brandUrl ?? null,
    brandLogoUrl: input.brandLogoUrl ?? null,
    startsAt,
    endsAt,
  };

  await db
    .insert(placements)
    .values(values)
    .onConflictDoUpdate({ target: placements.zoneId, set: values });
}
