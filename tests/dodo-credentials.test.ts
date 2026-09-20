import assert from "node:assert/strict";

import { getDodoDiagnostics, resolveDodoEnvironment } from "../lib/dodo/client";

/**
 * Regression guard for the misleading
 * "[DodoPayments] Credential/environment MISMATCH: keyClass=live-like" warning.
 *
 * Dodo publishes no key prefix that separates live keys from test keys, so a key
 * without a "test" marker proves NOTHING. The old classifier called every such
 * key "live-like" and reported a mismatch with test_mode — noise that sent
 * people chasing a working configuration. Only a key that literally carries a
 * test marker against live_mode is a PROVEN mismatch.
 */

type Env = Record<string, string | undefined>;

const ENV_KEYS = [
  "DODO_PAYMENTS_API_KEY",
  "DODO_API_KEY",
  "DODO_PAYMENTS_ENVIRONMENT",
  "DODO_MODE",
] as const;

function withEnv(vars: Env, fn: () => void): void {
  const saved: Env = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function run() {
  console.log("🧪 Testing Dodo key/environment diagnostics...\n");

  // ─── 1. Unset mode resolves to test_mode, never inferred from NODE_ENV ────
  withEnv({}, () => {
    assert.equal(resolveDodoEnvironment(), "test_mode");
  });
  withEnv({ DODO_PAYMENTS_ENVIRONMENT: "live" }, () => {
    assert.equal(resolveDodoEnvironment(), "live_mode");
  });
  withEnv({ DODO_MODE: "live_mode" }, () => {
    assert.equal(resolveDodoEnvironment(), "live_mode");
  });
  withEnv({ DODO_MODE: "test_mode", DODO_PAYMENTS_ENVIRONMENT: "live_mode" }, () => {
    // Explicit var wins over the legacy alias.
    assert.equal(resolveDodoEnvironment(), "live_mode");
  });
  console.log("   ✅ Environment resolution is explicit and alias-aware");

  // ─── 2. A key with a test marker against live_mode is a PROVEN mismatch ───
  withEnv(
    {
      DODO_PAYMENTS_API_KEY: "test_abc123",
      DODO_PAYMENTS_ENVIRONMENT: "live_mode",
    },
    () => {
      const diag = getDodoDiagnostics();
      assert.equal(diag.keyClass, "test");
      assert.equal(diag.keyEnvironmentCertainMismatch, true);
      assert.equal(diag.keyEnvironmentUnverified, false);
      assert.equal(diag.keyConfigured, true);
    }
  );
  console.log("   ✅ Test-marked key + live_mode is flagged as a proven mismatch");

  // ─── 3. A non-marked key in test_mode is UNVERIFIED, not a mismatch ───────
  // This is the exact case that used to log keyClass=live-like + MISMATCH.
  withEnv(
    {
      DODO_PAYMENTS_API_KEY: "dq7Kp2Xv9LmQ4Rt8Zs1YbNuH",
      DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    },
    () => {
      const diag = getDodoDiagnostics();
      assert.equal(diag.keyClass, "non-test");
      assert.equal(
        diag.keyEnvironmentCertainMismatch,
        false,
        "A key value without a marker must never be reported as a proven mismatch"
      );
      assert.equal(diag.keyEnvironmentUnverified, true);
    }
  );
  console.log("   ✅ Unmarked key in test_mode is 'unverified', not a false mismatch");

  // ─── 4. A marked key in test_mode is fine ─────────────────────────────────
  withEnv(
    {
      DODO_PAYMENTS_API_KEY: "test_abc123",
      DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    },
    () => {
      const diag = getDodoDiagnostics();
      assert.equal(diag.keyClass, "test");
      assert.equal(diag.keyEnvironmentCertainMismatch, false);
      assert.equal(diag.keyEnvironmentUnverified, false);
    }
  );
  // …and so is an unmarked key in live_mode.
  withEnv(
    {
      DODO_PAYMENTS_API_KEY: "dq7Kp2Xv9LmQ4Rt8Zs1YbNuH",
      DODO_PAYMENTS_ENVIRONMENT: "live_mode",
    },
    () => {
      const diag = getDodoDiagnostics();
      assert.equal(diag.keyEnvironmentCertainMismatch, false);
      assert.equal(diag.keyEnvironmentUnverified, false);
    }
  );
  console.log("   ✅ Matching key/environment pairs raise no warning");

  // ─── 5. Missing key is reported as missing, never as a mismatch ───────────
  withEnv({ DODO_PAYMENTS_ENVIRONMENT: "test_mode" }, () => {
    const diag = getDodoDiagnostics();
    assert.equal(diag.keyClass, "missing");
    assert.equal(diag.keyConfigured, false);
    assert.equal(diag.keyEnvironmentCertainMismatch, false);
    assert.equal(diag.keyEnvironmentUnverified, false);
    assert.equal(diag.envVarSource, "missing");
  });
  console.log("   ✅ Missing key is reported as missing");

  // ─── 6. The legacy alias is still honoured, and reported ──────────────────
  withEnv({ DODO_API_KEY: "test_legacy" }, () => {
    const diag = getDodoDiagnostics();
    assert.equal(diag.envVarSource, "DODO_API_KEY");
    assert.equal(diag.keyClass, "test");
  });
  console.log("   ✅ DODO_API_KEY alias still resolves");

  // ─── 7. Diagnostics never carry the key itself ────────────────────────────
  const SECRET = "test_supersecretvalue_9000";
  withEnv(
    { DODO_PAYMENTS_API_KEY: SECRET, DODO_PAYMENTS_ENVIRONMENT: "test_mode" },
    () => {
      const serialized = JSON.stringify(getDodoDiagnostics());
      assert.ok(
        !serialized.includes(SECRET),
        "Diagnostics must never contain the API key"
      );
      assert.ok(
        // No fragment of the secret either — only its length is exposed.
        !serialized.includes("supersecretvalue"),
        "Diagnostics must never contain a fragment of the API key"
      );
    }
  );
  console.log("   ✅ Diagnostics expose no secret material");

  console.log("\n🎉 Dodo credential diagnostics tests passed!\n");
}

run();
