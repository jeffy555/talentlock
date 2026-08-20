import { currencySymbol } from "./currencyUtils";

export type RateType = "hourly" | "per_day" | "per_session" | "per_course" | "per_shift";

const RATE_UNIT_LABELS: Record<RateType, string> = {
  hourly: "/hr",
  per_day: "/day",
  per_session: "/session",
  per_course: "/course",
  per_shift: "/shift",
};

export function formatRate(
  amount: number,
  rateType: RateType | null | undefined,
  currency: string = "USD",
): string {
  const symbol = currency.length === 3 ? currencySymbol(currency) : currency;
  const unit = RATE_UNIT_LABELS[rateType ?? "hourly"];
  return `${symbol}${amount.toLocaleString()}${unit}`;
}

export function rateUnitLabel(rateType: RateType | null | undefined): string {
  return RATE_UNIT_LABELS[rateType ?? "hourly"];
}

export function profileDefaultRateType(professionCategory: string | null | undefined): RateType {
  if (professionCategory === "education") return "per_session";
  if (professionCategory === "healthcare") return "per_shift";
  return "hourly";
}

export function paymentTypeToRateType(
  paymentType: string,
  jobRateType?: RateType | null,
): RateType {
  if (jobRateType) return jobRateType;
  if (paymentType === "daily") return "per_day";
  return "hourly";
}
