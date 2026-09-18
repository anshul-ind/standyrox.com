import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Dodo environment resolution — EXPLICIT ONLY.
 *
 * Production-focused fix: NEVER infer `live_mode` from `NODE_ENV==="production"`.
 * The previous logic auto-promoted every Vercel Production deployment to
 * `live_mode` when DODO_MODE / DODO_PAYMENTS_ENVIRONMENT was unset, so a test
 * key was sent to https://live.dodopayments.com and Dodo returned 401.
 *
 * Now: live_mode is used ONLY when the operator explicitly sets
 *   DODO_PAYMENTS_ENVIRONMENT=live_mode (or live)
 *   or DODO_MODE=live_mode (or live).
 * Everything else (unset, test, test_mode) resolves to test_mode.
 */
function resolveDodoEnvironment(): "test_mode" | "live_mode" {
  const raw = String(
    process.env.DODO_PAYMENTS_ENVIRONMENT ?? process.env.DODO_MODE ?? ""
  )
    .trim()
    .toLowerCase();
  if (raw === "live" || raw === "live_mode") return "live_mode";
  return "test_mode";
}

const resolvedDodoEnv = resolveDodoEnvironment();

/**
 * Skip validation ONLY while `next build` is collecting static routes.
 * The old check (`!!process.env.VERCEL`) was also true at runtime on Vercel,
 * which disabled validation in production and let empty-string defaults for
 * secrets slip through — surfacing later as a Dodo 401 instead of a clear
 * startup error. Runtime (including Vercel Production) MUST validate.
 */
const isBuildPhase =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE === "phase-production-build";

export const env = createEnv({
  skipValidation: isBuildPhase,
  server: {
    DATABASE_URL: z.string().url(),

    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    // Primary name is DODO_PAYMENTS_API_KEY; DODO_API_KEY is accepted as a
    // legacy alias. Preprocess merges the alias BEFORE the min(1) check so a
    // missing key FAILS validation at runtime instead of defaulting to "".
    DODO_PAYMENTS_API_KEY: z.preprocess(
      (v) =>
        (v as string | undefined) ??
        process.env.DODO_PAYMENTS_API_KEY ??
        process.env.DODO_API_KEY ??
        undefined,
      z.string().min(1, "DODO_PAYMENTS_API_KEY (or DODO_API_KEY) is required")
    ),

    DODO_PAYMENTS_WEBHOOK_SECRET: z.preprocess(
      (v) =>
        (v as string | undefined) ??
        process.env.DODO_PAYMENTS_WEBHOOK_SECRET ??
        process.env.DODO_WEBHOOK_SECRET ??
        undefined,
      z
        .string()
        .min(
          1,
          "DODO_PAYMENTS_WEBHOOK_SECRET (or DODO_WEBHOOK_SECRET) is required"
        )
    ),

    // Accepts test_mode/live_mode plus short aliases test/live and DODO_MODE.
    // Anything else (including unset) safely defaults to test_mode.
    DODO_PAYMENTS_ENVIRONMENT: z.preprocess(
      (v) => {
        const raw = String(
          (v as string | undefined) ??
            process.env.DODO_PAYMENTS_ENVIRONMENT ??
            process.env.DODO_MODE ??
            ""
        )
          .trim()
          .toLowerCase();
        if (raw === "live" || raw === "live_mode") return "live_mode";
        if (raw === "test" || raw === "test_mode" || raw === "")
          return "test_mode";
        return raw; // let the enum reject invalid values with a clear error
      },
      z.enum(["test_mode", "live_mode"])
    ),

    DODO_AD_ZONE_PRODUCT_ID: z.preprocess(
      (v) =>
        (v as string | undefined) ??
        process.env.DODO_AD_ZONE_PRODUCT_ID ??
        undefined,
      z.string().min(1, "DODO_AD_ZONE_PRODUCT_ID is required")
    ),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});

// Re-export for callers that need the resolved value without re-parsing.
export { resolvedDodoEnv };


