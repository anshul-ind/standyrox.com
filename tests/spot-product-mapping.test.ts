import assert from "node:assert/strict";

import {
  getDodoProductIdForSpot,
  getMissingSpotProductEnvVars,
  getTotalSpotProductCount,
} from "../lib/env";
import { SPOT_PRODUCTS, getSpotProductConfig } from "../lib/spot-products";
import { checkoutRequestSchema } from "../lib/validations/checkout";
import {
  extractCheckoutSessionId,
  extractOrderId,
  extractSpotId,
  extractTotalAmount,
  type DodoRawEvent,
} from "../lib/dodo/types";
import { verifyDodoWebhook } from "../lib/dodo/webhook";
import { Webhook } from "standardwebhooks";

/** Expected prices in cents, grouped by the intended pricing category. */
const EXPECTED_PRICE_CENTS: Record<string, number> = {
  chest_center: 2000, // Chest $20
  back_upper: 1500, // Back $15
  left_lower_back: 900, // Bum $9
  right_lower_back: 900, // Bum $9
  left_shoulder: 1000,
  right_shoulder: 1000,
  left_bicep: 1000, // Arms $10
  right_bicep: 1000,
  left_forearm: 1000,
  right_forearm: 1000,
  left_thigh_front: 600, // Front legs $6
  right_thigh_front: 600,
  left_calf: 500, // Lower body $5
  right_calf: 500,
  left_calf_back: 500,
  right_calf_back: 500,
};

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

function run() {
  console.log("🧪 Testing spot → price → Dodo product mapping...\n");

  // ─── 1. Mapping covers every zone and matches intended prices ─────────────
  const keys = Object.keys(SPOT_PRODUCTS).sort();
  const expectedKeys = Object.keys(EXPECTED_PRICE_CENTS).sort();
  assert.deepEqual(keys, expectedKeys, "Mapping must cover the same zone keys");
  assert.equal(getTotalSpotProductCount(), 16);

  for (const [key, cents] of Object.entries(EXPECTED_PRICE_CENTS)) {
    const config = getSpotProductConfig(key);
    assert.ok(config, `Missing config for ${key}`);
    assert.equal(config.priceCents, cents, `Wrong price for ${key}`);
    assert.match(
      config.envVar,
      /^DODO_PRODUCT_[A-Z_]+$/,
      `Env var naming wrong for ${key}`
    );
  }
  console.log(`   ✅ ${keys.length} spots mapped to prices + env vars`);

  // ─── 2. Unknown key is not purchasable ───────────────────────────────────
  assert.equal(getSpotProductConfig("not_a_spot"), null);
  assert.equal(getDodoProductIdForSpot("not_a_spot"), null);
  console.log("   ✅ Unknown spot key is not purchasable");

  // ─── 3. Product ID resolves only from the spot's own env var ─────────────
  // Use isolated values so this does not depend on whether the real env is set.
  const CHEST_ENV = "DODO_PRODUCT_CHEST_CENTER";
  const CALF_ENV = "DODO_PRODUCT_RIGHT_CALF";
  const savedChest = process.env[CHEST_ENV];
  const savedCalf = process.env[CALF_ENV];
  try {
    process.env[CHEST_ENV] = "pdt_test_chest";
    process.env[CALF_ENV] = "pdt_test_calf";
    assert.equal(getDodoProductIdForSpot("chest_center"), "pdt_test_chest");
    // A different spot must resolve ITS OWN product, never chest's.
    assert.equal(getDodoProductIdForSpot("right_calf"), "pdt_test_calf");
    assert.notEqual(
      getDodoProductIdForSpot("right_calf"),
      getDodoProductIdForSpot("chest_center")
    );

    // An unset env var resolves to null — no fallback product is ever used.
    delete process.env[CHEST_ENV];
    assert.equal(
      getDodoProductIdForSpot("chest_center"),
      null,
      "Unset env var must resolve to null (no fallback product)"
    );
  } finally {
    if (savedChest === undefined) delete process.env[CHEST_ENV];
    else process.env[CHEST_ENV] = savedChest;
    if (savedCalf === undefined) delete process.env[CALF_ENV];
    else process.env[CALF_ENV] = savedCalf;
  }
  console.log("   ✅ Per-spot product resolution (no cross-spot fallback)");

  // ─── 4. Missing env vars are reported by name only ───────────────────────
  const missing = getMissingSpotProductEnvVars();
  assert.ok(Array.isArray(missing));
  assert.ok(missing.every((name) => name.startsWith("DODO_PRODUCT_")));
  console.log(`   ✅ ${missing.length} product env vars still unset`);

  // ─── 5. Request strips client price / productId (manipulation blocked) ────
  const injected = checkoutRequestSchema.safeParse({
    spotId: VALID_UUID,
    brandName: "Acme",
    buyerEmail: "buyer@example.com",
    logoUrl: "https://example.com/logo.png",
    price: 1,
    amount: 1,
    currency: "XYZ",
    productId: "cheap-product",
    dodoProductId: "cheap-product",
  });
  assert.ok(injected.success, "Valid request with extra keys must parse");
  const parsed = injected.data as Record<string, unknown>;
  assert.equal(parsed.price, undefined, "price must be stripped");
  assert.equal(parsed.amount, undefined, "amount must be stripped");
  assert.equal(parsed.currency, undefined, "currency must be stripped");
  assert.equal(parsed.productId, undefined, "productId must be stripped");
  assert.equal(parsed.dodoProductId, undefined, "dodoProductId must be stripped");
  assert.equal(parsed.spotId, VALID_UUID);
  console.log("   ✅ Client price/productId/currency are ignored");

  // ─── 6. spotId is required ───────────────────────────────────────────────
  const missingSpot = checkoutRequestSchema.safeParse({
    brandName: "Acme",
    buyerEmail: "buyer@example.com",
    logoUrl: "https://example.com/logo.png",
  });
  assert.equal(missingSpot.success, false, "Request without spotId must fail");
  console.log("   ✅ spotId is required");

  // ─── 7. Deprecated zoneId alias still works mid-deploy ───────────────────
  const alias = checkoutRequestSchema.safeParse({
    zoneId: VALID_UUID,
    brandName: "Acme",
    buyerEmail: "buyer@example.com",
    logoUrl: "https://example.com/logo.png",
  });
  assert.ok(alias.success && alias.data.zoneId === VALID_UUID);
  console.log("   ✅ Deprecated zoneId alias accepted");

  // ─── 8. Env var names are unique (no two spots share a product) ──────────
  const envVars = Object.values(SPOT_PRODUCTS).map((c) => c.envVar);
  assert.equal(
    new Set(envVars).size,
    envVars.length,
    "Each spot must map to its own env var"
  );
  console.log("   ✅ Per-spot env var names are unique");

  // ─── 9. Webhook extractors identify the exact spot/payment ───────────────
  const event: DodoRawEvent = {
    type: "payment.succeeded",
    data: {
      payment_id: "pay_123",
      checkout_session_id: "cks_123",
      total_amount: 2000,
      currency: "USD",
      metadata: { order_id: "order_abc", spot_id: "zone_chest" },
    },
  };
  assert.equal(extractOrderId(event), "order_abc");
  assert.equal(extractSpotId(event), "zone_chest");
  assert.equal(extractCheckoutSessionId(event), "cks_123");
  assert.equal(extractTotalAmount(event), 2000);
  console.log("   ✅ Webhook extracts order / spot / session / amount");

  // Missing metadata must not fabricate a spot (mismatch protection relies on
  // the order row as authority; absence must be null, never a guess).
  assert.equal(extractSpotId({ type: "payment.succeeded", data: {} }), null);
  assert.equal(extractOrderId({ type: "payment.succeeded", data: {} }), null);
  console.log("   ✅ Missing webhook metadata yields null (no fabricated spot)");

  // Amount mismatch is detectable: paid total must equal the order amount.
  const mismatch = extractTotalAmount({
    type: "payment.succeeded",
    data: { total_amount: 500 },
  });
  assert.notEqual(mismatch, 2000, "A wrong charge must be detectable");
  console.log("   ✅ Paid-amount mismatch is detectable");

  // ─── 10. Webhook signature verification round-trip ───────────────────────
  // Regression guard: `standardwebhooks` returns `undefined` (not the payload)
  // when jsonParse is false, which previously made every valid webhook throw
  // "Invalid signature". Verify must accept a correctly-signed body.
  {
    const WEBHOOK_ENV = "DODO_PAYMENTS_WEBHOOK_SECRET";
    const saved = process.env[WEBHOOK_ENV];
    const secret = `whsec_${Buffer.from("standyrox-test-secret").toString("base64")}`;
    try {
      process.env[WEBHOOK_ENV] = secret;
      const wh = new Webhook(secret);
      const raw = JSON.stringify({
        type: "payment.succeeded",
        data: {
          metadata: { order_id: "o1", spot_id: "s1" },
          total_amount: 2000,
        },
      });
      const ts = new Date();
      const signature = wh.sign("msg_1", ts, raw);
      const verified = verifyDodoWebhook(raw, {
        "webhook-id": "msg_1",
        "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
        "webhook-signature": signature,
      });
      assert.equal(extractOrderId(verified), "o1", "Valid signature must parse");
      assert.equal(extractSpotId(verified), "s1");
      assert.equal(extractTotalAmount(verified), 2000);

      // A tampered signature must be rejected.
      assert.throws(
        () =>
          verifyDodoWebhook(raw, {
            "webhook-id": "msg_1",
            "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
            "webhook-signature": "v1,AAAA",
          }),
        "Tampered signature must be rejected"
      );
    } finally {
      if (saved === undefined) delete process.env[WEBHOOK_ENV];
      else process.env[WEBHOOK_ENV] = saved;
    }
  }
  console.log("   ✅ Webhook signature round-trip verifies (and rejects tampering)");

  console.log("\n🎉 Spot mapping tests passed!\n");
}

run();
