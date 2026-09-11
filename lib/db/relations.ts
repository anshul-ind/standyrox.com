import { relations } from "drizzle-orm";

import {
  avatarModels,
  adZones,
  orders,
  payments,
  placements,
} from "./schema";

// ─── avatar_models → ad_zones ────────────────────────────────────────────────
export const avatarModelsRelations = relations(avatarModels, ({ many }) => ({
  zones: many(adZones),
}));

// ─── ad_zones → { avatar_models, orders, placements } ───────────────────────
export const adZonesRelations = relations(adZones, ({ one, many }) => ({
  model: one(avatarModels, {
    fields: [adZones.modelId],
    references: [avatarModels.id],
  }),
  orders: many(orders),
  placement: one(placements),
}));

// ─── orders → { ad_zones, payments, placements } ────────────────────────────
export const ordersRelations = relations(orders, ({ one, many }) => ({
  zone: one(adZones, {
    fields: [orders.zoneId],
    references: [adZones.id],
  }),
  payments: many(payments),
  placement: one(placements),
}));

// ─── payments → orders ──────────────────────────────────────────────────────
export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
}));

// ─── placements → { ad_zones, orders } ──────────────────────────────────────
export const placementsRelations = relations(placements, ({ one }) => ({
  zone: one(adZones, {
    fields: [placements.zoneId],
    references: [adZones.id],
  }),
  order: one(orders, {
    fields: [placements.orderId],
    references: [orders.id],
  }),
}));
