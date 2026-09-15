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
  logoUrl: z
    .string()
    .min(1, "Logo must be uploaded first")
    .refine(
      (val) => val.startsWith("/") || /^https?:\/\//.test(val),
      "Logo must be a valid URL or path"
    ),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
