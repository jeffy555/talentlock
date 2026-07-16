import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

import { conversations } from "./conversations";
import { usersTable } from "./users";

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").references(() => usersTable.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  unreadByConversation: index("messages_unread_by_conversation")
    .on(t.conversationId, t.senderId)
    .where(sql`${t.readAt} IS NULL AND ${t.role} IN ('human_employer', 'human_freelancer')`),
  rateLimit: index("messages_rate_limit")
    .on(t.conversationId, t.senderId, t.createdAt)
    .where(sql`${t.role} IN ('human_employer', 'human_freelancer')`),
}));

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
