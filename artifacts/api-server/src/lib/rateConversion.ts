export const WORK_HOURS_PER_DAY = 8;

export function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function hourlyToDaily(hourly: number): number {
  return roundRate(hourly * WORK_HOURS_PER_DAY);
}

export function dailyToHourly(daily: number): number {
  return roundRate(daily / WORK_HOURS_PER_DAY);
}

export function parseOptionalRate(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function sanitizeStoredHourlyRate(hourly: number | null | undefined): number | null {
  if (hourly == null || !Number.isFinite(Number(hourly)) || Number(hourly) < 1) return null;
  return roundRate(Number(hourly));
}

export function normalizeCruiseModeRuleRates<T extends { minRate?: number | null; maxRate?: number | null }>(
  rules: T,
): T {
  return {
    ...rules,
    minRate: sanitizeStoredHourlyRate(rules.minRate),
    maxRate: sanitizeStoredHourlyRate(rules.maxRate),
  };
}

/**
 * Canonical hourly rate from a freelancer profile.
 *
 * - Daily preference: use dailyRate when present.
 * - Legacy bug: daily preference + dailyRate missing + hourlyRate present means the
 *   UI saved the daily amount into hourlyRate — treat that value as daily.
 * - Hourly preference: use hourlyRate, else derive from dailyRate.
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

/**
 * Persist a consistent hourly+daily pair.
 * For daily preference, dailyRate is the source of truth. If only hourlyRate is
 * provided, treat it as the daily amount (legacy Profile/onboarding writes).
 */
export function repairFreelancerRatePair(data: {
  paymentPreference?: string | null;
  hourlyRate?: number | string | null;
  dailyRate?: number | string | null;
}): {
  paymentPreference: "hourly" | "daily";
  hourlyRate: number | null;
  dailyRate: number | null;
} {
  const paymentPreference = data.paymentPreference === "hourly" ? "hourly" : "daily";
  const hourlyRate = parseOptionalRate(data.hourlyRate);
  const dailyRate = parseOptionalRate(data.dailyRate);

  if (paymentPreference === "hourly") {
    const resolvedHourly = hourlyRate ?? (dailyRate != null ? dailyToHourly(dailyRate) : null);
    const resolvedDaily = resolvedHourly != null ? hourlyToDaily(resolvedHourly) : null;
    return {
      paymentPreference,
      hourlyRate: resolvedHourly,
      dailyRate: resolvedDaily,
    };
  }

  const resolvedDaily = dailyRate ?? hourlyRate;
  const resolvedHourly = resolvedDaily != null ? dailyToHourly(resolvedDaily) : null;
  return {
    paymentPreference: "daily",
    hourlyRate: resolvedHourly,
    dailyRate: resolvedDaily,
  };
}

/** Convert a canonical hourly amount into a Talent Search rule unit. */
export function hourlyToTalentSearchUnit(
  hourly: number,
  rateType: string | null | undefined,
): number {
  if (rateType === "per_day" || rateType === "daily") return hourlyToDaily(hourly);
  return roundRate(hourly);
}
