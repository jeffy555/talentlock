import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { usersTable as users } from "./src/schema/users";

export const tokenUsage = pgTable("token_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  feature: text("feature").notNull(),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
