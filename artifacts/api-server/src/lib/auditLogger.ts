// Security Hardening — audit_logs extended Phase 2 (entityType, entityId, metadata jsonb).

import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";

type DB = typeof db;

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "agreement.signed"
  | "agreement.downloaded"
  | "subscription.upgraded"
  | "document.uploaded"
  | "admin.user_viewed"
  | "admin.login"
  | "admin.logout"
  | "account.deletion_requested"
  | "account.deletion_complete";

export async function logAudit(
  dbConn: DB,
  params: {
    userId?: number | null;
    clerkId?: string | null;
    email?: string | null;
    role?: string | null;
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await dbConn.insert(auditLogsTable).values({
    userId: params.userId ?? null,
    clerkId: params.clerkId ?? null,
    email: params.email ?? null,
    role: params.role ?? null,
    event: params.action,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata: params.metadata ?? null,
  });
}
