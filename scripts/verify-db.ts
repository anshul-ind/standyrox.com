import { count, eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { avatarModels, adZones, orders, payments, placements } from "../lib/db/schema";

async function verify() {
  console.log("🔍 Verifying seed data...\n");

  let passed = 0;
  let failed = 0;

  function check(label: string, actual: number, expected: number) {
    const ok = actual === expected;
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${label}: ${actual} (expected: ${expected})`);
    if (ok) passed++;
    else failed++;
  }

  try {
    // 1. Avatar models count
    const [modelCount] = await db
      .select({ value: count() })
      .from(avatarModels);
    check("Avatar models", modelCount.value, 1);

    // 2. Active avatar model exists
    const [activeModel] = await db
      .select({ value: count() })
      .from(avatarModels)
      .where(eq(avatarModels.active, true));
    check("Active avatar models", activeModel.value, 1);

    // 3. Ad zones count
    const [zoneCount] = await db
      .select({ value: count() })
      .from(adZones);
    check("Ad zones", zoneCount.value, 8);

    // 4. All zones available
    const [availableZones] = await db
      .select({ value: count() })
      .from(adZones)
      .where(eq(adZones.status, "available"));
    check("Available zones", availableZones.value, 8);

    // 5. All zones have view_count = 0
    const [zeroViewCount] = await db
      .select({ value: count() })
      .from(adZones)
      .where(eq(adZones.viewCount, 0));
    check("Zones with view_count=0", zeroViewCount.value, 8);

    // 6. Orders empty
    const [orderCount] = await db
      .select({ value: count() })
      .from(orders);
    check("Orders (should be empty)", orderCount.value, 0);

    // 7. Payments empty
    const [paymentCount] = await db
      .select({ value: count() })
      .from(payments);
    check("Payments (should be empty)", paymentCount.value, 0);

    // 8. Placements empty
    const [placementCount] = await db
      .select({ value: count() })
      .from(placements);
    check("Placements (should be empty)", placementCount.value, 0);

    console.log(`\n${"─".repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      console.log("\n❌ Some checks failed!\n");
      process.exit(1);
    } else {
      console.log("\n🎉 All verifications passed!\n");
      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ Verification failed with error:", error);
    process.exit(1);
  }
}

verify();
