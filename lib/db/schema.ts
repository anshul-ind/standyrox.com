import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const zoneTierEnum = pgEnum("zone_tier", [
  "standard",
  "featured",
  "prime",
  "signature",
]);

export const zoneStatusEnum = pgEnum("zone_status", [
  "available",
  "reserved",
  "occupied",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

export const placementStatusEnum = pgEnum("placement_status", [
  "pending",
  "active",
  "expired",
]);

// ─── avatar_models ───────────────────────────────────────────────────────────
export const avatarModels = pgTable("avatar_models", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  glbUrl: text("glb_url").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── ad_zones ────────────────────────────────────────────────────────────────
export const adZones = pgTable(
  "ad_zones",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    modelId: text("model_id")
      .notNull()
      .references(() => avatarModels.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    anchorX: real("anchor_x").notNull(),
    anchorY: real("anchor_y").notNull(),
    anchorZ: real("anchor_z").notNull(),
    normalX: real("normal_x"),
    normalY: real("normal_y"),
    normalZ: real("normal_z"),
    width: real("width").notNull(),
    height: real("height").notNull(),
    tier: zoneTierEnum("tier").notNull(),
    basePriceCents: integer("base_price_cents").notNull(),
    status: zoneStatusEnum("status").notNull().default("available"),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("ad_zones_model_id_key_unique").on(t.modelId, t.key)]
);

// ─── orders ──────────────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  zoneId: text("zone_id")
    .notNull()
    .references(() => adZones.id),
  buyerEmail: text("buyer_email").notNull(),
  buyerName: text("buyer_name"),
  brandName: text("brand_name").notNull(),
  brandUrl: text("brand_url"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: orderStatusEnum("status").notNull().default("pending"),
  externalPaymentId: text("external_payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─── payments ────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  provider: text("provider").notNull().default("dodo"),
  providerPaymentId: text("provider_payment_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  rawEvent: jsonb("raw_event"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ─── placements ──────────────────────────────────────────────────────────────
export const placements = pgTable(
  "placements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    zoneId: text("zone_id")
      .notNull()
      .references(() => adZones.id),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    status: placementStatusEnum("status").notNull().default("pending"),
    brandName: text("brand_name").notNull(),
    brandUrl: text("brand_url"),
    brandLogoUrl: text("brand_logo_url"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("placements_zone_id_unique").on(t.zoneId)]
);
