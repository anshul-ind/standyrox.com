import { NextResponse } from "next/server";

import { getDodoDiagnostics, probeDodoCredentials } from "@/lib/dodo/client";
import {
  getConfiguredSpotProductCount,
  getMissingSpotProductEnvVars,
  getTotalSpotProductCount,
} from "@/lib/env";

/**
 * GET /api/payments/dodo/status — sanitized payment-config health check.
 *
 * Returns booleans / environment names only. NEVER returns secret values,
 * prefixes, or suffixes. Safe to call from Vercel logs or a deployment check.
 *
 * `?probe=1` additionally asks Dodo whether the configured key is ACCEPTED in
 * the resolved environment (one read-only product list — creates/charges
 * nothing). That is the only way to settle a key↔environment question, because
 * a key value carries no reliable test/live marker. Without `?probe=1` this
 * endpoint stays a cheap, offline check.
 *
 * NOTE: reads process.env directly (not @/lib/env) so this endpoint still
 * answers even when env validation would otherwise throw on a misconfigured
 * deployment — exactly when you need it most.
 */
export async function GET(request: Request) {
  const diag = getDodoDiagnostics();
  const probeRequested =
    new URL(request.url).searchParams.get("probe") === "1";

  return NextResponse.json({
    databaseConfigured: !!(process.env.DATABASE_URL ?? "").trim(),
    keyConfigured: diag.keyConfigured,
    keyClass: diag.keyClass,
    keyLength: diag.keyLength,
    envVarSource: diag.envVarSource,
    environment: diag.environment,
    rawModeValue: diag.rawModeValue,
    baseUrl: diag.baseUrl,
    // Certain = proven broken (a test-marked key against live_mode).
    // Unverified = the key value proves nothing; run the probe to know.
    keyEnvironmentCertainMismatch: diag.keyEnvironmentCertainMismatch,
    keyEnvironmentUnverified: diag.keyEnvironmentUnverified,
    credentialProbe: probeRequested ? await probeDodoCredentials() : null,
    // Per-spot product configuration (names only — never values).
    spotProductsConfigured: getConfiguredSpotProductCount(),
    spotProductsTotal: getTotalSpotProductCount(),
    spotProductsMissing: getMissingSpotProductEnvVars(),
    // Legacy single-product var, retained for reference only.
    legacyProductConfigured:
      (process.env.DODO_AD_ZONE_PRODUCT_ID ?? "").trim().length > 0,
    appUrlConfigured:
      (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().length > 0,
  });
}
