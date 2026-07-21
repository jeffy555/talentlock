/**
 * Credential Expiry Tracking — shared expiry-stage math.
 * Stage only ever advances forward: none -> 90d -> 30d -> 7d -> expired.
 * Safe to run the scan more than once a day, and safe if a day is missed.
 */
export const EXPIRY_ALERT_STAGES = ["none", "90d", "30d", "7d", "expired"] as const;
export type ExpiryAlertStage = (typeof EXPIRY_ALERT_STAGES)[number];

const STAGE_ORDER: Record<ExpiryAlertStage, number> = {
  none: 0,
  "90d": 1,
  "30d": 2,
  "7d": 3,
  expired: 4,
};

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function targetStageForDaysRemaining(daysRemaining: number): ExpiryAlertStage {
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining <= 7) return "7d";
  if (daysRemaining <= 30) return "30d";
  if (daysRemaining <= 90) return "90d";
  return "none";
}

export function isExpiryAlertStage(value: string | null | undefined): value is ExpiryAlertStage {
  return (EXPIRY_ALERT_STAGES as readonly string[]).includes(value ?? "");
}

export function stageAdvanced(current: string | null | undefined, target: ExpiryAlertStage): boolean {
  const cur = isExpiryAlertStage(current) ? current : "none";
  return STAGE_ORDER[target] > STAGE_ORDER[cur];
}

export interface ExpiryAlertCopy {
  subject: string;
  message: string;
  email: boolean;
  inApp: boolean;
}

export function alertCopyForStage(
  stage: ExpiryAlertStage,
  credentialLabel: string,
  daysRemaining: number,
): ExpiryAlertCopy | null {
  switch (stage) {
    case "90d":
      return {
        subject: "Your credential expires in about 90 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Renew it soon to keep your verification current.`,
        email: true,
        inApp: false,
      };
    case "30d":
      return {
        subject: "Your credential expires in 30 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Please renew it to avoid losing your verified status.`,
        email: true,
        inApp: true,
      };
    case "7d":
      return {
        subject: "Urgent: your credential expires in 7 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Renew it now to avoid losing your verified status and Talent Vault visibility.`,
        email: true,
        inApp: true,
      };
    case "expired":
      return {
        subject: "Your credential has expired",
        message: `${credentialLabel} has expired. Please upload a renewed document to restore your verified status.`,
        email: true,
        inApp: true,
      };
    default:
      return null;
  }
}
