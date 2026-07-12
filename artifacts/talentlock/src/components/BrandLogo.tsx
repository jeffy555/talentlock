import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  variant?: "onDark" | "onLight";
  showWordmark?: boolean;
  className?: string;
};

const sizeMap = {
  sm: { icon: "h-4 w-4", text: "text-base", gap: "gap-1.5" },
  md: { icon: "h-5 w-5", text: "text-lg", gap: "gap-2" },
  lg: { icon: "h-7 w-7", text: "text-2xl", gap: "gap-2.5" },
} as const;

export function BrandLogo({
  size = "md",
  variant = "onDark",
  showWordmark = true,
  className,
}: BrandLogoProps) {
  const s = sizeMap[size];
  const wordmark = variant === "onDark" ? "text-white" : "text-primary";
  return (
    <span
      className={cn("inline-flex items-center", s.gap, className)}
      aria-label="TalentLock"
    >
      <Shield className={cn(s.icon, "text-gold shrink-0")} aria-hidden />
      {showWordmark && (
        <span className={cn("font-serif font-bold tracking-tight", s.text, wordmark)}>
          TalentLock
        </span>
      )}
    </span>
  );
}
