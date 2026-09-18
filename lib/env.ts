import { z } from "zod";

/**
 * Environment Configuration Architecture
 *
 * Designed for resilient Next.js production serverless deployments:
 * 1. Independent domain validation: Database, Dodo Payments, and App URL
 *    are validated on-demand per service rather than monolithic module-level crash.
 * 2. Unrelated routes (e.g. /api/zones) NEVER fail due to checkout/payment config.
 * 3. Safe error reporting: logs variable names and status, NEVER secrets/keys.
 * 4. Backward compatible `env` object with lazy getters and explicit helpers.
 */

// ─── Helpers & Normalizers ───────────────────────────────────────────────────

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let trimmed = url.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * Explicit Dodo environment resolution.
 * Rules:
 *   - "live" or "live_mode" -> "live_mode"
 *   - "test", "test_mode", or unset -> "test_mode"
 * NEVER inferred from NODE_ENV.
 */
export function resolveDodoEnvironment(): "test_mode" | "live_mode" {
  const raw = String(
    process.env.DODO_PAYMENTS_ENVIRONMENT ?? process.env.DODO_MODE ?? ""
  )
    .trim()
    .toLowerCase();
  if (raw === "live" || raw === "live_mode") return "live_mode";
  return "test_mode";
}

export const resolvedDodoEnv = resolveDodoEnvironment();

// ─── App URL Resolution ──────────────────────────────────────────────────────

export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://standyrox.anshulx.me"
      : "http://localhost:3000");

  const normalized = normalizeUrl(raw);
  const parsed = z.string().url().safeParse(normalized);

  if (parsed.success) {
    return parsed.data;
  }

  // Final safe fallback
  return process.env.NODE_ENV === "production"
    ? "https://standyrox.anshulx.me"
    : "http://localhost:3000";
}

// ─── Database Environment ────────────────────────────────────────────────────

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("[env] DATABASE_URL is missing. Please set DATABASE_URL in Vercel Production environment.");
    throw new Error("[env] DATABASE_URL is required but not configured");
  }
  const parsed = z.string().url().safeParse(url);
  if (!parsed.success) {
    console.error("[env] DATABASE_URL is not a valid URL.");
    throw new Error("[env] DATABASE_URL must be a valid connection URL");
  }
  return url;
}

// ─── Dodo Payments Environment ───────────────────────────────────────────────

export function getDodoApiKey(): string {
  const key = (
    process.env.DODO_PAYMENTS_API_KEY ??
    process.env.DODO_API_KEY ??
    ""
  ).trim();
  return key;
}

export function getDodoProductId(): string {
  const id = (process.env.DODO_AD_ZONE_PRODUCT_ID ?? "").trim();
  return id;
}

export function getDodoWebhookSecret(): string {
  const secret = (
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET ??
    process.env.DODO_WEBHOOK_SECRET ??
    ""
  ).trim();
  return secret;
}

// ─── Safe Diagnostics (NEVER logs secrets) ───────────────────────────────────

export interface SafeEnvDiagnostics {
  databaseConfigured: boolean;
  dodoKeyConfigured: boolean;
  dodoKeySource: "DODO_PAYMENTS_API_KEY" | "DODO_API_KEY" | "missing";
  dodoProductConfigured: boolean;
  dodoWebhookConfigured: boolean;
  dodoEnvironment: "test_mode" | "live_mode";
  appUrl: string;
  blobTokenConfigured: boolean;
}

export function getSafeEnvDiagnostics(): SafeEnvDiagnostics {
  const hasDb = !!process.env.DATABASE_URL?.trim();
  const rawKey = getDodoApiKey();
  const source: SafeEnvDiagnostics["dodoKeySource"] = process.env.DODO_PAYMENTS_API_KEY
    ? "DODO_PAYMENTS_API_KEY"
    : process.env.DODO_API_KEY
      ? "DODO_API_KEY"
      : "missing";

  return {
    databaseConfigured: hasDb,
    dodoKeyConfigured: rawKey.length > 0,
    dodoKeySource: source,
    dodoProductConfigured: getDodoProductId().length > 0,
    dodoWebhookConfigured: getDodoWebhookSecret().length > 0,
    dodoEnvironment: resolveDodoEnvironment(),
    appUrl: getAppUrl(),
    blobTokenConfigured: !!process.env.BLOB_READ_WRITE_TOKEN?.trim(),
  };
}

// ─── Backward-compatible `env` Export ─────────────────────────────────────────

export const env = {
  get DATABASE_URL(): string {
    return getDatabaseUrl();
  },

  get DODO_PAYMENTS_API_KEY(): string {
    const key = getDodoApiKey();
    if (!key) {
      throw new Error("[env] DODO_PAYMENTS_API_KEY (or DODO_API_KEY) is required for payment operations");
    }
    return key;
  },

  get DODO_PAYMENTS_ENVIRONMENT(): "test_mode" | "live_mode" {
    return resolveDodoEnvironment();
  },

  get DODO_PAYMENTS_WEBHOOK_SECRET(): string {
    const secret = getDodoWebhookSecret();
    if (!secret) {
      throw new Error("[env] DODO_PAYMENTS_WEBHOOK_SECRET (or DODO_WEBHOOK_SECRET) is required for webhook operations");
    }
    return secret;
  },

  get DODO_AD_ZONE_PRODUCT_ID(): string {
    const id = getDodoProductId();
    if (!id) {
      throw new Error("[env] DODO_AD_ZONE_PRODUCT_ID is required for checkout operations");
    }
    return id;
  },

  get NEXT_PUBLIC_APP_URL(): string {
    return getAppUrl();
  },

  get BLOB_READ_WRITE_TOKEN(): string | undefined {
    return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  },
};
