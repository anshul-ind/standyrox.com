-- Drop old tables (currency-domain leftovers)
DROP TABLE IF EXISTS "placements" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "orders" CASCADE;
DROP TABLE IF EXISTS "positions" CASCADE;
DROP TABLE IF EXISTS "denominations" CASCADE;
DROP TABLE IF EXISTS "currencies" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Drop old enum types if they exist
DROP TYPE IF EXISTS "zone_tier" CASCADE;
DROP TYPE IF EXISTS "zone_status" CASCADE;
DROP TYPE IF EXISTS "order_status" CASCADE;
DROP TYPE IF EXISTS "payment_status" CASCADE;
DROP TYPE IF EXISTS "placement_status" CASCADE;

--> statement-breakpoint

-- Create new enum types
CREATE TYPE "zone_tier" AS ENUM ('standard', 'featured', 'prime', 'signature');
CREATE TYPE "zone_status" AS ENUM ('available', 'reserved', 'occupied');
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'failed', 'expired', 'cancelled');
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE "placement_status" AS ENUM ('pending', 'active', 'expired');

--> statement-breakpoint

-- avatar_models
CREATE TABLE "avatar_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"glb_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ad_zones
CREATE TABLE "ad_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"anchor_x" real NOT NULL,
	"anchor_y" real NOT NULL,
	"anchor_z" real NOT NULL,
	"normal_x" real,
	"normal_y" real,
	"normal_z" real,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"tier" "zone_tier" NOT NULL,
	"base_price_cents" integer NOT NULL,
	"status" "zone_status" DEFAULT 'available' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_zones_model_id_key_unique" UNIQUE("model_id", "key")
);
--> statement-breakpoint

-- orders
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_name" text,
	"brand_name" text NOT NULL,
	"brand_url" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"external_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- payments
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"provider" text DEFAULT 'dodo' NOT NULL,
	"provider_payment_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw_event" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- placements
CREATE TABLE "placements" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"order_id" text NOT NULL,
	"status" "placement_status" DEFAULT 'pending' NOT NULL,
	"brand_name" text NOT NULL,
	"brand_url" text,
	"brand_logo_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_zone_id_unique" UNIQUE("zone_id")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "ad_zones" ADD CONSTRAINT "ad_zones_model_id_avatar_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."avatar_models"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_ad_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."ad_zones"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "placements" ADD CONSTRAINT "placements_zone_id_ad_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."ad_zones"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "placements" ADD CONSTRAINT "placements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
