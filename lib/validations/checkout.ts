import { z } from "zod";

/**
 * Checkout request.
 *
 * SECURITY: the client sends ONLY the selected spot identifier plus order
 * details. Price, currency and Dodo product ID are resolved server-side from
 * `lib/spot-products.ts` and are NEVER read from this payload.
 *
 * Unknown keys (e.g. `price`, `productId`, `dodoProductId`) are stripped by zod
 * and can never influence the charge.
 *
 * `spotId` is the ad-zone id. `zoneId` is accepted as a deprecated alias so an
 * older client cannot break mid-deploy.
 */
export const checkoutRequestSchema = z
  .object({
    spotId: z.string().uuid().optional(),
    zoneId: z.string().uuid().optional(),
    brandName: z.string().min(1, "Brand name is required"),
    brandUrl: z
      .string()
      .url("Must be a valid URL")
      .optional()
      .or(z.literal("")),
    buyerEmail: z.string().email("Must be a valid email"),
    logoUrl: z
      .string()
      .min(1, "Logo must be uploaded first")
      .refine(
        (val) => val.startsWith("/") || /^https?:\/\//.test(val),
        "Logo must be a valid URL or path"
      ),
  })
  .refine((data) => Boolean(data.spotId ?? data.zoneId), {
    message: "spotId is required",
    path: ["spotId"],
  });

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
