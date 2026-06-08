export function getMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split("-");
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleString("en", { month: "short" });
}

export function getLast6Months(): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toLocaleString()}`;
}

export function fillZeroMonths(
  months: string[],
  earningsRows: { month: string; total: number }[],
): number[] {
  const map = new Map(earningsRows.map((r) => [r.month, Number(r.total)]));
  return months.map((m) => map.get(m) ?? 0);
}

export function monthRange(isoMonth: string): { start: Date; end: Date } {
  const [year, month] = isoMonth.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export function currentCalendarMonthRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export type AnalyticsWindow = "30d" | "90d" | "12m";

export function getWindowDates(window: AnalyticsWindow) {
  const now = new Date();
  const days = window === "30d" ? 30 : window === "90d" ? 90 : 365;
  const msPerDay = 24 * 60 * 60 * 1000;
  const currentStart = new Date(now.getTime() - days * msPerDay);
  const previousStart = new Date(currentStart.getTime() - days * msPerDay);
  return {
    currentStart,
    currentEnd: now,
    previousStart,
    previousEnd: currentStart,
  };
}

export function safeAverage(values: number[]): number | null {
  if (values.length < 3) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export type LifecycleTrend = "faster" | "slower" | "same" | null;

export function getLifecycleTrend(
  current: number | null,
  previous: number | null,
): LifecycleTrend {
  if (current === null || previous === null || previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  if (diff > 5) return "slower";
  if (diff < -5) return "faster";
  return "same";
}
