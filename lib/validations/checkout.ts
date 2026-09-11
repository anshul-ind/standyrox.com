import { z } from "zod";

export const checkoutRequestSchema = z.object({
  zoneId: z.string().uuid(),
  brandName: z.string().min(1, "Brand name is required"),
  brandUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  buyerEmail: z.string().email("Must be a valid email"),
  logoUrl: z.string().url("Logo must be uploaded first"),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
