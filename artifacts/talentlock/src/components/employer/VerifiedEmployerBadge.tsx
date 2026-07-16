import { CheckCircle2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerificationLevel = "unverified" | "partially_verified" | "fully_verified";

export function VerifiedEmployerBadge({
  verificationLevel,
  size = "sm",
}: {
  verificationLevel?: VerificationLevel | string | null;
  size?: "sm" | "md";
}) {
  if (verificationLevel !== "fully_verified" && verificationLevel !== "partially_verified") return null;
  const full = verificationLevel === "fully_verified";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-medium",
      full
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
      size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
    )}>
      {full
        ? <CheckCircle2 className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        : <ShieldCheck className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {full ? "Verified Employer" : "ID Verified"}
    </span>
  );
}
