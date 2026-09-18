import DodoPayments from "dodopayments";
import { env } from "@/lib/env";

let client: DodoPayments | null = null;

export function getDodoClient(): DodoPayments {
  if (client) return client;

  const apiKey = process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY || env.DODO_PAYMENTS_API_KEY;
  const rawMode = (process.env.DODO_MODE || process.env.DODO_PAYMENTS_ENVIRONMENT || env.DODO_PAYMENTS_ENVIRONMENT || "").toLowerCase();
  const isLive = rawMode === "live" || rawMode === "live_mode" || (process.env.NODE_ENV === "production" && rawMode !== "test" && rawMode !== "test_mode");
  const environment: "live_mode" | "test_mode" = isLive ? "live_mode" : "test_mode";

  if (!apiKey) {
    console.error("❌ [DodoPayments] FATAL: Missing API Key (DODO_PAYMENTS_API_KEY or DODO_API_KEY)!");
    throw new Error("[DodoPayments] Missing Dodo Payments API Key");
  }

  if (isLive) {
    if (apiKey.startsWith("test_") || apiKey.includes("test")) {
      console.warn("⚠️ [DodoPayments] WARNING: Running in LIVE_MODE but API Key appears to have a test prefix!");
    }
    console.log("🚀 [DodoPayments] Initialized DodoPayments client in LIVE_MODE");
  } else {
    console.log("🧪 [DodoPayments] Initialized DodoPayments client in TEST_MODE");
  }

  client = new DodoPayments({
    bearerToken: apiKey,
    environment,
  });

  return client;
}

