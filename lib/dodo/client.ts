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

/**
 * Coarse classification of the API key, used for diagnostics only.
 *
 *  - `test`     — the key carries a literal "test" marker. Such a key can ONLY
 *                 work against test_mode, so pairing it with live_mode is a
 *                 PROVEN misconfiguration.
 *  - `non-test` — no marker. Dodo publishes no key prefix that separates live
 *                 keys from test keys, so this value proves NOTHING: a real
 *                 test key with no marker lands here too. Only a probe
 *                 (`probeDodoCredentials`) can settle which environment the key
 *                 belongs to.
 *  - `missing`  — no key configured.
 *
 * This replaces the old "anything without 'test' is live-like" guess, which
 * logged a scary CREDENTIAL/ENVIRONMENT MISMATCH for perfectly working test
 * deployments and sent people chasing a problem that did not exist.
 */
export type DodoKeyClass = "test" | "non-test" | "missing";

function classifyKey(key: string): DodoKeyClass {
  if (key.length === 0) return "missing";
  return key.toLowerCase().includes("test") ? "test" : "non-test";
}

export interface DodoDiagnostics {
  /** Server-side only — safe to log. Never includes the key value. */
  keyConfigured: boolean;
  keyLength: number;
  keyClass: DodoKeyClass;
  environment: DodoEnvironment;
  baseUrl: string;
  envVarSource: "DODO_PAYMENTS_API_KEY" | "DODO_API_KEY" | "missing";
  rawModeValue: string;
  /**
   * TRUE only for a mismatch we can PROVE from the key itself: a key with a
   * "test" marker can never authenticate against live_mode. This is the only
   * case where the configuration is definitely broken.
   */
  keyEnvironmentCertainMismatch: boolean;
  /**
   * TRUE when the key cannot be classified from its value, so we cannot tell
   * whether it belongs to the resolved environment. This is NOT an error by
   * itself — it means "unverified", and only a probe can confirm it.
   */
  keyEnvironmentUnverified: boolean;
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
  const keyClass = classifyKey(key);

  return {
    keyConfigured: key.length > 0,
    keyLength: key.length,
    keyClass,
    environment,
    baseUrl: DODO_BASE_URLS[environment],
    envVarSource: source,
    rawModeValue: rawMode === "" ? "(unset → test_mode)" : rawMode,
    keyEnvironmentCertainMismatch:
      environment === "live_mode" && keyClass === "test",
    keyEnvironmentUnverified:
      environment === "test_mode" && keyClass === "non-test",
  };
}

// ─── Error helpers (shared with lib/dodo/checkout.ts) ────────────────────────

/** Pull an HTTP status off any SDK error shape. Never throws. */
export function extractStatusCode(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null) {
    const rec = err as Record<string, unknown>;
    if (typeof rec.status === "number") return rec.status;
    if (typeof rec.statusCode === "number") return rec.statusCode;
    // Stainless SDK errors nest the HTTP status in several shapes.
    const error = rec.error as Record<string, unknown> | undefined;
    if (error && typeof error.statusCode === "number")
      return error.statusCode as number;
    // Some Stainless builds expose status only on the message, e.g. "401 ...".
    if (err instanceof Error) {
      const m = err.message.match(/\b(401|403|404|409|422|429|5\d\d)\b/);
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}

/**
 * Short, sanitized error text for diagnostics. Truncated and stripped of
 * anything that could look like a bearer token, so it is safe to return from an
 * endpoint or write to logs.
 */
export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/(bearer|api[_-]?key|token)\s*[:=]?\s*\S+/gi, "$1=<redacted>")
    .slice(0, 200);
}

export interface DodoCredentialProbe {
  /** TRUE only when the resolved environment actually accepted the key. */
  ok: boolean;
  environment: DodoEnvironment;
  baseUrl: string;
  status: number | null;
  /** Short sanitized reason — safe to display. */
  message: string;
}

/**
 * Ask Dodo whether the configured key works in the resolved environment.
 *
 * This is the ONLY truthful answer to "is my key/environment pair right?": the
 * key string itself cannot be classified (see `classifyKey`). The call is a
 * read-only product list with `page_size: 1` — it creates nothing, charges
 * nothing and returns no secret material.
 */
export async function probeDodoCredentials(): Promise<DodoCredentialProbe> {
  const diag = getDodoDiagnostics();
  const base: Omit<DodoCredentialProbe, "ok" | "status" | "message"> = {
    environment: diag.environment,
    baseUrl: diag.baseUrl,
  };

  try {
    await getDodoClient().products.list({ page_size: 1 });
    return {
      ...base,
      ok: true,
      status: 200,
      message: `Credentials accepted by ${diag.environment}`,
    };
  } catch (err) {
    const status = extractStatusCode(err) ?? null;
    return {
      ...base,
      ok: false,
      status,
      message:
        status === 401
          ? `Key rejected by ${diag.environment} (401). A test key only works with test_mode; a live key only with live_mode.`
          : sanitizeErrorMessage(err),
    };
  }
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

  if (diag.keyEnvironmentCertainMismatch) {
    console.error(
      `[DodoPayments] Credential/environment MISMATCH (proven): keyClass=${diag.keyClass} ` +
        `environment=${diag.environment} baseUrl=${diag.baseUrl} source=${diag.envVarSource}. ` +
        "This key carries a test marker, so it can never authenticate against live_mode. " +
        "Set DODO_PAYMENTS_ENVIRONMENT=test_mode (or rotate to a live key) and redeploy."
    );
  } else if (diag.keyEnvironmentUnverified) {
    console.warn(
      `[DodoPayments] Key/environment UNVERIFIED: keyClass=${diag.keyClass} ` +
        `environment=${diag.environment} baseUrl=${diag.baseUrl}. The key value carries no ` +
        "test/live marker, so it cannot be classified from the string alone — this is not " +
        "necessarily a mismatch. Call GET /api/payments/dodo/status?probe=1 to ask Dodo " +
        "whether this key is accepted in this environment."
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
