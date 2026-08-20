export const WORK_HOURS_PER_DAY = 8;

export type RateInputUnit = "hourly" | "daily";

export function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function hourlyToDaily(hourly: number): number {
  return roundRate(hourly * WORK_HOURS_PER_DAY);
}

export function dailyToHourly(daily: number): number {
  return roundRate(daily / WORK_HOURS_PER_DAY);
}

export function parseRateInput(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseOptionalRate(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Stored Cruise Mode rule rates are hourly — discard junk from partial input. */
export function sanitizeStoredHourlyRate(hourly: number | null | undefined): number | null {
  if (hourly == null || !Number.isFinite(hourly) || hourly < 1) return null;
  return roundRate(hourly);
}

export function formatRateForInput(value: number): string {
  const rounded = roundRate(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function displayRateFromStoredHourly(
  hourly: number | null | undefined,
  unit: RateInputUnit,
): string {
  const sanitized = sanitizeStoredHourlyRate(hourly);
  if (sanitized == null) return "";
  const amount = unit === "daily" ? hourlyToDaily(sanitized) : sanitized;
  return formatRateForInput(amount);
}

export function storedHourlyFromDisplayAmount(
  amount: number,
  unit: RateInputUnit,
): number | null {
  const hourly = unit === "daily" ? dailyToHourly(amount) : roundRate(amount);
  return sanitizeStoredHourlyRate(hourly);
}

/**
 * Resolve profile to hourly. Daily preference + missing dailyRate treats hourlyRate
 * as the daily amount (legacy store bug).
 */
export function resolveProfileHourlyRate(profile: {
  paymentPreference?: string | null;
  hourlyRate?: number | string | null;
  dailyRate?: number | string | null;
}): number | null {
  const preference = profile.paymentPreference === "hourly" ? "hourly" : "daily";
  const hourly = parseOptionalRate(profile.hourlyRate);
  const daily = parseOptionalRate(profile.dailyRate);

  if (preference === "daily") {
    if (daily != null) return dailyToHourly(daily);
    if (hourly != null) return dailyToHourly(hourly);
    return null;
  }

  if (hourly != null) return roundRate(hourly);
  if (daily != null) return dailyToHourly(daily);
  return null;
}

export function resolveProfileDailyRate(profile: {
  paymentPreference?: string | null;
  hourlyRate?: number | string | null;
  dailyRate?: number | string | null;
}): number | null {
  const preference = profile.paymentPreference === "hourly" ? "hourly" : "daily";
  const hourly = parseOptionalRate(profile.hourlyRate);
  const daily = parseOptionalRate(profile.dailyRate);

  if (preference === "daily") {
    if (daily != null) return roundRate(daily);
    if (hourly != null) return roundRate(hourly);
    return null;
  }

  const resolvedHourly = resolveProfileHourlyRate(profile);
  return resolvedHourly == null ? null : hourlyToDaily(resolvedHourly);
}

/** Amount + unit for profile rate display. */
export function resolveProfileDisplayRate(profile: {
  paymentPreference?: string | null;
  hourlyRate?: number | string | null;
  dailyRate?: number | string | null;
}): { amount: number; unit: RateInputUnit } | null {
  const preference = profile.paymentPreference === "hourly" ? "hourly" : "daily";
  if (preference === "hourly") {
    const amount = resolveProfileHourlyRate(profile);
    return amount == null ? null : { amount, unit: "hourly" };
  }
  const amount = resolveProfileDailyRate(profile);
  return amount == null ? null : { amount, unit: "daily" };
}
