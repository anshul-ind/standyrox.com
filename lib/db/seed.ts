import { eq } from "drizzle-orm";
import { db } from ".";
import { avatarModels, adZones } from "./schema";

// ─── Zone definitions (derived from measured GLB bounding box proportions) ────
// modelHeight: 1.8899, modelWidth: 1.8270, modelDepth: 0.3848, feetY: -0.0149, centerX: 0.0000
//
// Width/height are anatomically proportioned — NOT uniform.
//   chest_center  : wide horizontal  (W > H, ~1.44:1)
//   back_upper    : wide horizontal  (W > H, ~1.4:1 — slightly larger than chest)
//   left/right_shoulder : small, roughly square
//   left/right_bicep    : narrow vertical (H > W, ~1:1.6)
//   left/right_forearm  : narrower & shorter than bicep (smaller area overall)
const ZONE_DATA = [
  {
    key: "chest_center",
    label: "Chest",
    tier: "signature" as const,
    basePriceCents: 50000,
    displayOrder: 1,
    anchorX: 0.0,
    anchorY: 1.157,
    anchorZ: 0.192,
    normalX: 0,
    normalY: 0,
    normalZ: 1,
    width: 0.252,  // wide horizontal (1.4:1)
    height: 0.18,
  },
  {
    key: "left_shoulder",
    label: "Left Shoulder",
    tier: "prime" as const,
    basePriceCents: 25000,
    displayOrder: 2,
    anchorX: 0.20,
    anchorY: 1.47,
    anchorZ: 0.045,
    normalX: 0.2,
    normalY: 0.0,
    normalZ: 0.98,
    width: 0.12,   // small square (1:1)
    height: 0.12,
  },
  {
    key: "right_shoulder",
    label: "Right Shoulder",
    tier: "prime" as const,
    basePriceCents: 25000,
    displayOrder: 3,
    anchorX: -0.20,
    anchorY: 1.47,
    anchorZ: 0.045,
    normalX: -0.2,
    normalY: 0.0,
    normalZ: 0.98,
    width: 0.12,   // small square (1:1) — mirrors left
    height: 0.12,
  },
  {
    key: "back_upper",
    label: "Upper Back",
    tier: "signature" as const,
    basePriceCents: 35000,
    displayOrder: 12,
    anchorX: 0.0,
    anchorY: 1.459,
    anchorZ: -0.192,
    normalX: 0,
    normalY: 0,
    normalZ: -1,
    width: 0.28,   // wide horizontal (1.4:1)
    height: 0.20,
  },
  {
    key: "left_bicep",
    label: "Left Bicep",
    tier: "prime" as const,
    basePriceCents: 15000,
    displayOrder: 4,
    anchorX: 0.35,
    anchorY: 1.50,
    anchorZ: 0.015,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.10,   // narrow vertical (1:1.6)
    height: 0.16,
  },
  {
    key: "right_bicep",
    label: "Right Bicep",
    tier: "prime" as const,
    basePriceCents: 15000,
    displayOrder: 5,
    anchorX: -0.35,
    anchorY: 1.50,
    anchorZ: 0.015,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.10,   // narrow vertical (1:1.6) — mirrors left
    height: 0.16,
  },
  {
    key: "left_forearm",
    label: "Left Forearm",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 6,
    anchorX: 0.52,
    anchorY: 1.50,
    anchorZ: -0.01,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.075,  // same orientation as bicep (1:1.6), smaller overall area
    height: 0.12,
  },
  {
    key: "right_forearm",
    label: "Right Forearm",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 7,
    anchorX: -0.52,
    anchorY: 1.50,
    anchorZ: -0.01,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.075,  // same orientation as bicep (1:1.6), smaller overall area — mirrors left
    height: 0.12,
  },
  {
    key: "left_thigh_front",
    label: "Left Thigh",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 8,
    anchorX: 0.11,
    anchorY: 0.78,
    anchorZ: 0.09,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.085,  // vertical (1:1.6)
    height: 0.136,
  },
  {
    key: "right_thigh_front",
    label: "Right Thigh",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 9,
    anchorX: -0.11,
    anchorY: 0.78,
    anchorZ: 0.09,
    normalX: 0.0,
    normalY: 0.0,
    normalZ: 1.0,
    width: 0.085,  // vertical (1:1.6) — mirrors left
    height: 0.136,
  },
  {
    key: "left_calf",
    label: "Left Calf",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 10,
    anchorX: 0.11,
    anchorY: 0.38,
    anchorZ: 0.06,
    normalX: 0.05,
    normalY: 0.0,
    normalZ: 0.99,
    width: 0.075,  // vertical (1:1.6)
    height: 0.12,
  },
  {
    key: "right_calf",
    label: "Right Calf",
    tier: "standard" as const,
    basePriceCents: 8000,
    displayOrder: 11,
    anchorX: -0.11,
    anchorY: 0.38,
    anchorZ: 0.06,
    normalX: -0.05,
    normalY: 0.0,
    normalZ: 0.99,
    width: 0.075,  // vertical (1:1.6) — mirrors left
    height: 0.12,
  },
] as const;

// ─── Seed function (idempotent) ──────────────────────────────────────────────
export async function seed() {
  console.log("🌱 Seeding database...\n");

  // 1. Get or create active avatar model (single source of truth)
  console.log("1️⃣  Checking active avatar model...");
  let [model] = await db
    .select()
    .from(avatarModels)
    .where(eq(avatarModels.active, true))
    .limit(1);

  if (!model) {
    [model] = await db
      .insert(avatarModels)
      .values({
        name: "Avatar v1",
        glbUrl: "/models/avatar-v1.glb",
        active: true,
      })
      .returning();
  }
  console.log(`   ✅ Model: ${model.id} — ${model.name}`);

  // 2. Upsert ad zones (idempotent by model_id + key)
  console.log("\n2️⃣  Upserting ad zones (12 zones)...");
  for (const zone of ZONE_DATA) {
    await db
      .insert(adZones)
      .values({
        modelId: model.id,
        key: zone.key,
        label: zone.label,
        displayOrder: zone.displayOrder,
        anchorX: zone.anchorX,
        anchorY: zone.anchorY,
        anchorZ: zone.anchorZ,
        normalX: zone.normalX,
        normalY: zone.normalY,
        normalZ: zone.normalZ,
        width: zone.width,
        height: zone.height,
        tier: zone.tier,
        basePriceCents: zone.basePriceCents,
        status: "available",
      })
      .onConflictDoUpdate({
        target: [adZones.modelId, adZones.key],
        set: {
          label: zone.label,
          displayOrder: zone.displayOrder,
          anchorX: zone.anchorX,
          anchorY: zone.anchorY,
          anchorZ: zone.anchorZ,
          normalX: zone.normalX,
          normalY: zone.normalY,
          normalZ: zone.normalZ,
          width: zone.width,
          height: zone.height,
          tier: zone.tier,
          basePriceCents: zone.basePriceCents,
        },
      });
    console.log(`   ✅ Zone: ${zone.key} — ${zone.label} (${zone.tier}, $${zone.basePriceCents / 100})`);
  }

  console.log("\n🎉 Seed complete!\n");
}
