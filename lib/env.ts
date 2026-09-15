import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    DODO_PAYMENTS_API_KEY: z
      .string()
      .min(1, "DODO_PAYMENTS_API_KEY is required"),

    DODO_PAYMENTS_WEBHOOK_SECRET: z
      .string()
      .min(1, "DODO_PAYMENTS_WEBHOOK_SECRET is required"),

    DODO_PAYMENTS_ENVIRONMENT: z
      .enum(["test_mode", "live_mode"])
      .default("test_mode"),

    DODO_AD_ZONE_PRODUCT_ID: z
      .string()
      .min(1, "DODO_AD_ZONE_PRODUCT_ID is required"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
