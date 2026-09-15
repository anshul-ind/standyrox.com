import { eq, and, asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { avatarModels, adZones, placements } from "@/lib/db/schema";
import { releaseExpiredReservations } from "./reservation.service";

// ─── Response shapes ──────────────────────────────────────────────────────────
export interface ZonePlacement {
  brandName: string;
  brandUrl: string | null;
  brandLogoUrl: string | null;
  endsAt: string | null;
}

export interface ZoneListItem {
  id: string;
  key: string;
  label: string;
  anchor: { x: number; y: number; z: number };
  /** Surface normal for raycasting — determines ray direction for DecalZone */
  normal: { x: number; y: number; z: number };
  size: { width: number; height: number };
  displayOrder: number;
  tier: string;
  basePriceCents: number;
  status: string;
  viewCount: number;
  placement: ZonePlacement | null;
}

export interface ZonesResponse {
  modelId: string;
  glbUrl: string;
  zones: ZoneListItem[];
}

// ─── getZones ────────────────────────────────────────────────────────────────
/**
 * All zones for the active avatar model, each with its current active
 * placement (left join). Returns null if no active model exists.
 */
export async function getZones(): Promise<ZonesResponse | null> {
  // Step 12: expire stale pending reservations before reporting status so a
  // released zone is available on this read (not a later one).
  await releaseExpiredReservations();

  const [model] = await db
    .select()
    .from(avatarModels)
    .where(eq(avatarModels.active, true))
    .limit(1);

  if (!model) return null;

  const zoneRows = await db
    .select({ zone: adZones, placement: placements })
    .from(adZones)
    .leftJoin(
      placements,
      and(
        eq(placements.zoneId, adZones.id),
        eq(placements.status, "active")
      )
    )
    .where(eq(adZones.modelId, model.id))
    .orderBy(asc(adZones.displayOrder));

  return {
    modelId: model.id,
    glbUrl: model.glbUrl,
    zones: zoneRows.map(({ zone, placement }) => ({
      id: zone.id,
      key: zone.key,
      label: zone.label,
      anchor: { x: zone.anchorX, y: zone.anchorY, z: zone.anchorZ },
      // Surface normal from DB — critical for raycasting in DecalZone.
      // Falls back to Z-forward (0,0,1) if null (legacy rows without normals).
      normal: {
        x: zone.normalX ?? 0,
        y: zone.normalY ?? 0,
        z: zone.normalZ ?? 1,
      },
      size: { width: zone.width, height: zone.height },
      displayOrder: zone.displayOrder,
      tier: zone.tier,
      basePriceCents: zone.basePriceCents,
      status: zone.status,
      viewCount: zone.viewCount,
      placement: placement
        ? {
            brandName: placement.brandName,
            brandUrl: placement.brandUrl,
            brandLogoUrl: placement.brandLogoUrl,
            endsAt: placement.endsAt?.toISOString() ?? null,
          }
        : null,
    })),
  };
}

// ─── getZoneById ──────────────────────────────────────────────────────────────
/**
 * Single zone with its active placement. Returns null if not found.
 */
export async function getZoneById(
  id: string
): Promise<ZoneListItem | null> {
  // Step 12: expire stale pending reservations before reporting status.
  await releaseExpiredReservations();

  const [row] = await db
    .select({ zone: adZones, placement: placements })
    .from(adZones)
    .leftJoin(
      placements,
      and(
        eq(placements.zoneId, adZones.id),
        eq(placements.status, "active")
      )
    )
    .where(eq(adZones.id, id))
    .limit(1);

  if (!row) return null;

  const { zone, placement } = row;
  return {
    id: zone.id,
    key: zone.key,
    label: zone.label,
    anchor: { x: zone.anchorX, y: zone.anchorY, z: zone.anchorZ },
    normal: {
      x: zone.normalX ?? 0,
      y: zone.normalY ?? 0,
      z: zone.normalZ ?? 1,
    },
    size: { width: zone.width, height: zone.height },
    displayOrder: zone.displayOrder,
    tier: zone.tier,
    basePriceCents: zone.basePriceCents,
    status: zone.status,
    viewCount: zone.viewCount,
    placement: placement
      ? {
          brandName: placement.brandName,
          brandUrl: placement.brandUrl,
          brandLogoUrl: placement.brandLogoUrl,
          endsAt: placement.endsAt?.toISOString() ?? null,
        }
      : null,
  };
}
