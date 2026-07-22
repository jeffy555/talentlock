import { currencyName } from "@/lib/currencyUtils";
import { Info } from "lucide-react";

interface BookingCurrencyBannerProps {
  currencyCode: string;
  freelancerName?: string | null;
  displayCurrencyCode?: string;
  variant?: "employer" | "pre-booking";
}

export function BookingCurrencyBanner({
  currencyCode,
  freelancerName,
  displayCurrencyCode,
  variant = "employer",
}: BookingCurrencyBannerProps) {
  const currencyLabel = `${currencyName(currencyCode)} (${currencyCode})`;
  const displayLabel = displayCurrencyCode
    ? `${currencyName(displayCurrencyCode)} (${displayCurrencyCode})`
    : null;

  const message =
    variant === "pre-booking"
      ? `Rates on this profile are in ${currencyLabel}. Your booking will use ${currencyLabel}.`
      : displayLabel
        ? `Rates on this booking are in ${currencyLabel}${freelancerName ? ` — ${freelancerName}'s currency` : ""}. Enter your proposed rate in ${currencyCode}. Your ${displayLabel} estimate appears below for reference only.`
        : `Rates on this booking are in ${currencyLabel}. Enter amounts in ${currencyCode}.`;

  return (
    <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
