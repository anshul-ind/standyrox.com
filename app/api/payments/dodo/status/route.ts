import { NextResponse } from "next/server";

import { getDodoDiagnostics } from "@/lib/dodo/client";

/**
 * GET /api/payments/dodo/status — sanitized payment-config health check.
 *
 * Returns booleans / environment names only. NEVER returns secret values,
 * prefixes, or suffixes. Safe to call from Vercel logs or a deployment check.
 *
 * NOTE: reads process.env directly (not @/lib/env) so this endpoint still
 * answers even when env validation would otherwise throw on a misconfigured
 * deployment — exactly when you need it most.
 */
export async function GET() {
  const diag = getDodoDiagnostics();
  return NextResponse.json({
    keyConfigured: diag.keyConfigured,
    keyClass: diag.keyClass,
    keyLength: diag.keyLength,
    envVarSource: diag.envVarSource,
    environment: diag.environment,
    rawModeValue: diag.rawModeValue,
    baseUrl: diag.baseUrl,
    keyEnvironmentMismatch: diag.keyEnvironmentMismatch,
    productConfigured:
      (process.env.DODO_AD_ZONE_PRODUCT_ID ?? "").trim().length > 0,
    appUrlConfigured:
      (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().length > 0,
  });
}

