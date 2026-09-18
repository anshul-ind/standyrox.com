import DodoPayments from "dodopayments";

export type DodoEnvironment = "live_mode" | "test_mode";

/** Base URLs used by the Dodo SDK — kept here for diagnostics only. */
const DODO_BASE_URLS: Record<DodoEnvironment, string> = {
  live_mode: "https://live.dodopayments.com",
  test_mode: "https://test.dodopayments.com",
};

/**
 * Resolve the Dodo environment EXPLICITLY.
 *
 * Rule: live_mode ONLY when the operator sets
 *   DODO_PAYMENTS_ENVIRONMENT=live_mode (or live) OR DODO_MODE=live_mode (or live).
 * Never infer from NODE_ENV — Vercel Production always has NODE_ENV=production,
 * and that auto-promotion was the production 401 root cause.
 */
export function resolveDodoEnvironment(): DodoEnvironment {
  const raw = String(
    process.env.DODO_PAYMENTS_ENVIRONMENT ?? process.env.DODO_MODE ?? ""
  )
    .trim()
    .toLowerCase();
  if (raw === "live" || raw === "live_mode") return "live_mode";
  return "test_mode";
}

/** Resolve the API key from server-side-only vars (never NEXT_PUBLIC_*). */
export function resolveDodoApiKey(): string {
  // NOTE: intentionally reads process.env directly instead of @/lib/env so the
  // status endpoint and error paths keep working even when env validation
  // would throw on a misconfigured deployment.
  const key = (
    process.env.DODO_PAYMENTS_API_KEY ??
    process.env.DODO_API_KEY ??
    ""
  ).trim();
  return key;
}

/** Coarse, non-secret classification of a key for mismatch warnings. */
function classifyKey(key: string): "test" | "live-like" | "unknown" {
  const k = key.toLowerCase();
  if (k.startsWith("test_") || k.includes("test")) return "test";
  // Dodo live keys do not carry a reliable public prefix across accounts, so
  // anything non-test is only "live-like" — used for warnings, never proof.
  if (key.length > 0) return "live-like";
  return "unknown";
}

export interface DodoDiagnostics {
  /** Server-side only — safe to log. Never includes the key value. */
  keyConfigured: boolean;
  keyLength: number;
  keyClass: "test" | "live-like" | "missing";
  environment: DodoEnvironment;
  baseUrl: string;
  envVarSource: "DODO_PAYMENTS_API_KEY" | "DODO_API_KEY" | "missing";
  rawModeValue: string;
  keyEnvironmentMismatch: boolean;
}

/**
 * Sanitized diagnostics — contains NO secret material.
 * Safe for server logs and the /api/payments/dodo/status endpoint.
 */
export function getDodoDiagnostics(): DodoDiagnostics {
  const rawMode = String(
    process.env.DODO_PAYMENTS_ENVIRONMENT ?? process.env.DODO_MODE ?? ""
  );
  const environment = resolveDodoEnvironment();
  const key = resolveDodoApiKey();
  const source: DodoDiagnostics["envVarSource"] = process.env
    .DODO_PAYMENTS_API_KEY
    ? "DODO_PAYMENTS_API_KEY"
    : process.env.DODO_API_KEY
      ? "DODO_API_KEY"
      : key
        ? "DODO_PAYMENTS_API_KEY"
        : "missing";
  const keyClass =
    key.length === 0
      ? "missing"
      : classifyKey(key) === "test"
        ? "test"
        : "live-like";
  return {
    keyConfigured: key.length > 0,
    keyLength: key.length,
    keyClass,
    environment,
    baseUrl: DODO_BASE_URLS[environment],
    envVarSource: source,
    rawModeValue: rawMode === "" ? "(unset → test_mode)" : rawMode,
    keyEnvironmentMismatch:
      (environment === "live_mode" && keyClass === "test") ||
      (environment === "test_mode" && keyClass === "live-like"),
  };
}

export class DodoConfigError extends Error {
  code = "DODO_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "DodoConfigError";
  }
}

/**
 * Create a Dodo client per call (no module-level singleton).
 * The old singleton cached the first key/environment for the lifetime of a
 * warm serverless function, so rotating keys / fixing env vars required
 * waiting for a cold start — and stale credentials kept 401ing.
 * Constructing per request is cheap (no I/O) and always uses fresh env.
 */
export function getDodoClient(): DodoPayments {
  const apiKey = resolveDodoApiKey();
  const diag = getDodoDiagnostics();

  if (!apiKey) {
    console.error(
      "[DodoPayments] Missing API key. " +
        `keyConfigured=${diag.keyConfigured} environment=${diag.environment} ` +
        `source=${diag.envVarSource}. ` +
        "Set DODO_PAYMENTS_API_KEY in the Vercel Production environment and redeploy."
    );
    throw new DodoConfigError(
      "Dodo Payments API key is not configured (DODO_PAYMENTS_API_KEY or DODO_API_KEY). " +
        "Set it in the deployment Production environment and redeploy."
    );
  }

  if (diag.keyEnvironmentMismatch) {
    console.error(
      `[DodoPayments] Credential/environment MISMATCH: keyClass=${diag.keyClass} ` +
        `environment=${diag.environment} baseUrl=${diag.baseUrl} source=${diag.envVarSource}. ` +
        "Test keys only work with test_mode; live keys only with live_mode. " +
        "Fix DODO_PAYMENTS_ENVIRONMENT (or DODO_MODE) to match the key and redeploy."
    );
  }

  console.log(
    `[DodoPayments] Client init: environment=${diag.environment} ` +
      `baseUrl=${diag.baseUrl} keyConfigured=true keyClass=${diag.keyClass} ` +
      `source=${diag.envVarSource}`
  );

  return new DodoPayments({
    bearerToken: apiKey,
    environment: diag.environment,
  });
}


