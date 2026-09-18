import assert from "node:assert/strict";
import {
  getAppUrl,
  getDatabaseUrl,
  getSafeEnvDiagnostics,
} from "../lib/env";
import { getZones } from "../lib/services/zone.service";
import { getDodoDiagnostics } from "../lib/dodo/client";

async function runTests() {
  console.log("🧪 Running Production & Smoke Tests...\n");

  // ─── Test 1: App URL Normalization & Fallbacks ─────────────────────────────
  console.log("1️⃣ Testing App URL Normalization & Fallbacks...");
  {
    const url = getAppUrl();
    assert.ok(url.startsWith("http"), `Expected url to start with http/https, got ${url}`);
    assert.ok(!url.endsWith("/"), `Expected url to have no trailing slash, got ${url}`);
    console.log(`   ✅ App URL resolved cleanly: ${url}`);
  }

  // ─── Test 2: Safe Environment Diagnostics (No secrets leaked) ───────────────
  console.log("\n2️⃣ Testing Safe Environment Diagnostics...");
  {
    const diag = getSafeEnvDiagnostics();
    assert.equal(typeof diag.databaseConfigured, "boolean");
    assert.equal(typeof diag.dodoKeyConfigured, "boolean");
    assert.equal(typeof diag.dodoProductConfigured, "boolean");
    assert.equal(typeof diag.dodoWebhookConfigured, "boolean");
    assert.ok(["test_mode", "live_mode"].includes(diag.dodoEnvironment));

    // Verify string representation contains no secret keywords or values
    const serialized = JSON.stringify(diag);
    assert.ok(!serialized.includes("secret"), "Diagnostics must never leak 'secret' keyword with values");
    assert.ok(!serialized.includes("bearer"), "Diagnostics must never leak bearer token");
    console.log("   ✅ Safe diagnostics verified (no secrets exposed):", diag);
  }

  // ─── Test 3: Dodo Client Diagnostics & Environment Mismatch Checks ─────────
  console.log("\n3️⃣ Testing Dodo Client Diagnostics...");
  {
    const dodoDiag = getDodoDiagnostics();
    assert.ok(["test_mode", "live_mode"].includes(dodoDiag.environment));
    assert.ok(dodoDiag.baseUrl.startsWith("https://"));
    console.log(`   ✅ Dodo environment: ${dodoDiag.environment} -> Base URL: ${dodoDiag.baseUrl}`);
    console.log(`   ✅ Key configured: ${dodoDiag.keyConfigured} (source: ${dodoDiag.envVarSource})`);
  }

  // ─── Test 4: Database Connection & getZones() API Route Core ───────────────
  console.log("\n4️⃣ Testing Database Connection & /api/zones query...");
  {
    const dbUrl = getDatabaseUrl();
    assert.ok(dbUrl.startsWith("postgres") || dbUrl.startsWith("postgresql"), "DATABASE_URL is valid postgres URL");

    const result = await getZones();
    assert.ok(result !== null, "getZones() should return active avatar model and zones");
    assert.ok(result.zones.length > 0, `Expected at least 1 zone, found ${result.zones.length}`);
    assert.ok(typeof result.modelId === "string");
    assert.ok(typeof result.glbUrl === "string");

    const firstZone = result.zones[0];
    assert.ok(firstZone.id, "Zone has id");
    assert.ok(firstZone.key, "Zone has key");
    assert.ok(firstZone.label, "Zone has label");
    assert.ok(firstZone.anchor, "Zone has anchor coordinates");
    assert.ok(typeof firstZone.basePriceCents === "number", "Zone has basePriceCents");

    console.log(`   ✅ /api/zones service returned ${result.zones.length} zones for model: ${result.glbUrl}`);
    console.log(`   ✅ Sample zone: ${firstZone.key} ("${firstZone.label}") - $${firstZone.basePriceCents / 100}`);
  }

  console.log("\n🎉 All smoke tests passed successfully!\n");
}

runTests().catch((err) => {
  console.error("\n❌ Test failure:", err);
  process.exit(1);
});
