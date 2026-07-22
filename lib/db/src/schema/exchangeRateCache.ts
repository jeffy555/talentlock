import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const exchangeRateCacheTable = pgTable("exchange_rate_cache", {
  id: text("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(),
});

export type ExchangeRateCache = typeof exchangeRateCacheTable.$inferSelect;
