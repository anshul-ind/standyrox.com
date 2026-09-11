import { db } from ".";
import { avatarModels, adZones } from "./schema";

// ─── Zone definitions ────────────────────────────────────────────────────────
const ZONE_DATA = [
  { key: "chest_center", label: "Chest", tier: "signature" as const, basePriceCents: 50000 },
  { key: "left_shoulder", label: "Left Shoulder", tier: "prime" as const, basePriceCents: 25000 },
  { key: "right_shoulder", label: "Right Shoulder", tier: "prime" as const, basePriceCents: 25000 },
  { key: "back_upper", label: "Upper Back", tier: "prime" as const, basePriceCents: 25000 },
  { key: "left_bicep", label: "Left Bicep", tier: "featured" as const, basePriceCents: 15000 },
  { key: "right_bicep", label: "Right Bicep", tier: "featured" as const, basePriceCents: 15000 },
  { key: "left_forearm", label: "Left Forearm", tier: "standard" as const, basePriceCents: 8000 },
  { key: "right_forearm", label: "Right Forearm", tier: "standard" as const, basePriceCents: 8000 },
] as const;

// ─── Seed function (idempotent) ──────────────────────────────────────────────
export async function seed() {
  console.log("🌱 Seeding database...\n");

  // 1. Upsert avatar model (idempotent)
  console.log("1️⃣  Upserting avatar model...");
  const [model] = await db
    .insert(avatarModels)
    .values({
      name: "Avatar v1",
      glbUrl: "/models/avatar-v1.glb",
      active: true,
    })
    .onConflictDoUpdate({
      target: avatarModels.id,
      set: { name: "Avatar v1", glbUrl: "/models/avatar-v1.glb", active: true },
    })
    .returning();
  console.log(`   ✅ Model: ${model.id} — ${model.name}`);

  // 2. Upsert ad zones (idempotent by model_id + key)
  console.log("\n2️⃣  Upserting ad zones (8 zones)...");
  for (const zone of ZONE_DATA) {
    await db
      .insert(adZones)
      .values({
        modelId: model.id,
        key: zone.key,
        label: zone.label,
        anchorX: 0,
        anchorY: 0,
        anchorZ: 0,
        width: 0.15,
        height: 0.15,
        tier: zone.tier,
        basePriceCents: zone.basePriceCents,
        status: "available",
      })
      .onConflictDoUpdate({
        target: [adZones.modelId, adZones.key],
        set: {
          label: zone.label,
          tier: zone.tier,
          basePriceCents: zone.basePriceCents,
        },
      });
    console.log(`   ✅ Zone: ${zone.key} — ${zone.label} (${zone.tier}, $${zone.basePriceCents / 100})`);
  }

  console.log("\n🎉 Seed complete!\n");
}
