import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portfolioItemsTable = pgTable("portfolio_items", {
  id: serial("id").primaryKey(),
  freelancerId: integer("freelancer_id").notNull(), // freelancer_profiles.id
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  imageUrl: text("image_url"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byFreelancer: index("portfolio_items_freelancer_idx").on(t.freelancerId),
}));

export const insertPortfolioItemSchema = createInsertSchema(portfolioItemsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertPortfolioItem = z.infer<typeof insertPortfolioItemSchema>;
export type PortfolioItem = typeof portfolioItemsTable.$inferSelect;
