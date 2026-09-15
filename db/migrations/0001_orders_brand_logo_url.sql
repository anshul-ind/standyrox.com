--> statement-breakpoint

-- Sprint 5: persist the uploaded brand logo on the order so the webhook can
-- copy it into the placement during payment.succeeded.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "brand_logo_url" text;