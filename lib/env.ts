import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Determine Dodo environment dynamically from DODO_MODE, DODO_PAYMENTS_ENVIRONMENT, or NODE_ENV
const rawMode = (process.env.DODO_MODE || process.env.DODO_PAYMENTS_ENVIRONMENT || "").toLowerCase();
const resolvedDodoEnv =
  rawMode === "live" || rawMode === "live_mode" || (process.env.NODE_ENV === "production" && rawMode !== "test" && rawMode !== "test_mode")
    ? "live_mode"
    : "test_mode";

export const env = createEnv({
  skipValidation: !!process.env.VERCEL || process.env.npm_lifecycle_event === "build",
  server: {
    DATABASE_URL: z.string().url(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    DODO_PAYMENTS_API_KEY: z
      .string()
      .min(1, "DODO_PAYMENTS_API_KEY (or DODO_API_KEY) is required")
      .default(process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY || ""),

    DODO_PAYMENTS_WEBHOOK_SECRET: z
      .string()
      .min(1, "DODO_PAYMENTS_WEBHOOK_SECRET (or DODO_WEBHOOK_SECRET) is required")
      .default(process.env.DODO_PAYMENTS_WEBHOOK_SECRET || process.env.DODO_WEBHOOK_SECRET || ""),

    DODO_PAYMENTS_ENVIRONMENT: z
      .enum(["test_mode", "live_mode"])
      .default(resolvedDodoEnv),

    DODO_AD_ZONE_PRODUCT_ID: z
      .string()
      .min(1, "DODO_AD_ZONE_PRODUCT_ID is required")
      .default(process.env.DODO_AD_ZONE_PRODUCT_ID || ""),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});

