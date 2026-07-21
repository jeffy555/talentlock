import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { freelancerProfilesTable } from "./freelancerProfiles";

export const documentsTable = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    freelancerId: integer("freelancer_id")
      .notNull()
      .references(() => freelancerProfilesTable.id),
    documentType: text("document_type").notNull(),
    // government_id | professional_credential
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull().default("pending"),
    // pending | verified | rejected | needs_review | expired
    confidence: integer("confidence"),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    expiryAlertStage: text("expiry_alert_stage").notNull().default("none"),
    // none | 90d | 30d | 7d | expired
    aiNotes: text("ai_notes"),
    adminNotes: text("admin_notes"),
    reviewedBy: text("reviewed_by"),
    // ai | admin
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    uniqFreelancerDocumentType: unique().on(t.freelancerId, t.documentType),
  }),
);

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
