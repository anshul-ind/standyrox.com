import { eq, and, asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { avatarModels, adZones, placements } from "@/lib/db/schema";

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
  size: { width: number; height: number };
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
    .orderBy(asc(adZones.key));

  return {
    modelId: model.id,
    glbUrl: model.glbUrl,
    zones: zoneRows.map(({ zone, placement }) => ({
      id: zone.id,
      key: zone.key,
      label: zone.label,
      anchor: { x: zone.anchorX, y: zone.anchorY, z: zone.anchorZ },
      size: { width: zone.width, height: zone.height },
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
    size: { width: zone.width, height: zone.height },
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
