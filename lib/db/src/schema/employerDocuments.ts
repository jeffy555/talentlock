import { index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { employerProfilesTable } from "./employerProfiles";

// Employer verification mirrors the freelancer document naming conventions but
// remains a separate table so employer and freelancer privacy boundaries stay explicit.
export const employerDocumentsTable = pgTable(
  "employer_documents",
  {
    id: serial("id").primaryKey(),
    employerId: integer("employer_id")
      .notNull()
      .references(() => employerProfilesTable.id),
    documentType: text("document_type").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull().default("pending"),
    confidence: integer("confidence"),
    aiNotes: text("ai_notes"),
    employerNotes: text("employer_notes"),
    adminNotes: text("admin_notes"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({
    uniqueEmployerDocumentType: unique().on(t.employerId, t.documentType),
    employerIdx: index("employer_documents_employer_idx").on(t.employerId),
    statusIdx: index("employer_documents_status_idx").on(t.status),
  }),
);

export type EmployerDocumentType =
  | "company_registration"
  | "tax_vat_certificate"
  | "business_licence"
  | "representative_id"
  | "proof_of_business_address";

export type EmployerDocumentStatus = "pending" | "verified" | "rejected" | "needs_review";
export type EmployerVerificationLevel = "unverified" | "partially_verified" | "fully_verified";

export interface EmployerDocReviewResult {
  status: EmployerDocumentStatus;
  confidence: number;
  documentTypeMatch: boolean;
  companyNameMatch: boolean | null;
  registrationNumberVisible: boolean;
  isLegible: boolean;
  hasExpiry: boolean;
  isExpired: boolean | null;
  tamperingConcern: boolean;
  adminNotes: string;
  employerNotes: string;
}

export const insertEmployerDocumentSchema = createInsertSchema(employerDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployerDocument = z.infer<typeof insertEmployerDocumentSchema>;
export type EmployerDocument = typeof employerDocumentsTable.$inferSelect;
