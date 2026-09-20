/**
 * Read-only credential check for Standyrox.
 *
 * Answers the only question that matters when Dodo returns 401:
 * "is the configured API key accepted in the environment this app resolves?"
 *
 * A key value carries no reliable test/live marker, so this cannot be answered
 * by looking at the string — it has to be asked of the API. Do that here:
 * one read-only product list, no writes, no charges, no secrets printed.
 *
 * Run:
 *
 *   npx tsx --env-file=.env.local scripts/verify-dodo-credentials.ts
 *   (or: npm run verify:credentials)
 */
import {
  getDodoDiagnostics,
  probeDodoCredentials,
  sanitizeErrorMessage,
} from "../lib/dodo/client";
import {
  getConfiguredSpotProductCount,
  getMissingSpotProductEnvVars,
  getTotalSpotProductCount,
} from "../lib/env";

async function main() {
  const diag = getDodoDiagnostics();

  console.log("\n🔐 Dodo credential check (read-only)\n");
  console.log(`   environment      ${diag.environment}`);
  console.log(`   baseUrl          ${diag.baseUrl}`);
  console.log(`   key source       ${diag.envVarSource}`);
  console.log(`   key length       ${diag.keyLength}`);
  console.log(`   raw mode value   ${diag.rawModeValue}`);
  console.log(`   key configured   ${diag.keyConfigured}`);
  console.log(`   key class        ${diag.keyClass}`);
  console.log(
    `   proven mismatch  ${diag.keyEnvironmentCertainMismatch}` +
      (diag.keyEnvironmentCertainMismatch
        ? "  ← a test-marked key can never work against live_mode"
        : "")
  );
  console.log(
    `   unverified       ${diag.keyEnvironmentUnverified}` +
      (diag.keyEnvironmentUnverified
        ? "  ← no marker in the key; the probe below is the answer"
        : "")
  );

  if (!diag.keyConfigured) {
    console.error(
      "\n❌ No API key configured. Set DODO_PAYMENTS_API_KEY (or DODO_API_KEY).\n"
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n   Asking Dodo whether this key works in this environment…");
  const probe = await probeDodoCredentials();

  console.log(
    `\n${probe.ok ? "✅" : "❌"} ${probe.ok ? "ACCEPTED" : "REJECTED"} — ` +
      `${probe.environment} @ ${probe.baseUrl}` +
      `${probe.status === null ? "" : ` (HTTP ${probe.status})`}`
  );
  console.log(`   ${probe.message}\n`);

  if (!probe.ok) {
    console.log(
      "   Fix: a test key only works with DODO_PAYMENTS_ENVIRONMENT=test_mode,\n" +
        "   and a live key only with live_mode. The product IDs in\n" +
        "   DODO_PRODUCT_* must come from the SAME environment as the key.\n"
    );
  } else {
    console.log(
      `   Spot products configured: ${getConfiguredSpotProductCount()}/` +
        `${getTotalSpotProductCount()}`
    );
    const missing = getMissingSpotProductEnvVars();
    if (missing.length > 0) console.log(`   Missing: ${missing.join(", ")}`);
    console.log(
      '   Run "npm run verify:products" to check each product\'s price.\n'
    );
  }

  process.exitCode = probe.ok ? 0 : 1;
}

main().catch((err) => {
  console.error("Credential check failed:", sanitizeErrorMessage(err));
  process.exitCode = 1;
});
