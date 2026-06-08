import type { VerificationLevel } from "@workspace/api-client-react";
import { Shield, ShieldCheck } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface VerificationBadgeProps {
  level: VerificationLevel;
  size?: "sm" | "md";
  showTooltip?: boolean;
}

function tooltipContent(level: VerificationLevel): string {
  const disclaimer = "Document reviewed by AI — not a legal identity verification.";
  if (level === "fully_verified") {
    return `Identity and credentials verified by AI review\n${disclaimer}`;
  }
  return `1 document verified — additional documents can be submitted\n${disclaimer}`;
}

function ariaLabel(level: VerificationLevel): string {
  return level === "fully_verified" ? "Verified freelancer" : "Partially verified freelancer";
}

export default function VerificationBadge({
  level,
  size = "md",
  showTooltip = false,
}: VerificationBadgeProps) {
  if (level === "unverified") return null;

  const isSmall = size === "sm";
  const isFull = level === "fully_verified";

  const className = isFull
    ? isSmall
      ? "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700"
      : "inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 border border-emerald-200"
    : isSmall
      ? "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700"
      : "inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200";

  const label = isFull
    ? isSmall
      ? "Verified"
      : "Fully Verified"
    : isSmall
      ? "Verified*"
      : "Partially Verified";

  const badge = (
    <span className={className} aria-label={ariaLabel(level)}>
      {isFull ? (
        <ShieldCheck className={isSmall ? "h-3 w-3" : "h-4 w-4"} />
      ) : (
        <Shield className={isSmall ? "h-3 w-3" : "h-4 w-4"} />
      )}
      {label}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-[220px] whitespace-pre-wrap text-xs">
          {tooltipContent(level)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
