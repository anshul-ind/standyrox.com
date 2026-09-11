import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DODO_PAYMENTS_API_KEY: z.string().optional(),
    DODO_PAYMENTS_WEBHOOK_KEY: z.string().optional(),
    DODO_PAYMENTS_ENVIRONMENT: z.string().optional(),
    DODO_PAYMENTS_RETURN_URL: z.string().url().optional(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
  },
  experimental__runtimeEnv: {},
});
