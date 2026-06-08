import { format, parseISO, isValid } from "date-fns";

export type BlockReason = "booked" | "holiday" | "unavailable";

export interface AvailabilityBlockLike {
  startDate: string;
  endDate: string;
  reason: string;
}

function parseDateOnly(value: string): Date {
  const d = parseISO(value.length === 10 ? value : value.slice(0, 10));
  return isValid(d) ? d : new Date(value);
}

export function formatNextAvailable(dateStr: string | null | undefined): string {
  if (!dateStr) return "Not available";
  const date = parseDateOnly(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  if (date <= today) return "Available now";
  return `Available ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}`;
}

export function nextAvailableColour(dateStr: string | null | undefined): string {
  if (!dateStr) return "text-slate-400";
  const date = parseDateOnly(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  if (date <= today) return "text-emerald-600";
  return "text-amber-600";
}

export function getAvailabilityColour(reason: string): string {
  switch (reason) {
    case "booked":
      return "bg-indigo-200 text-indigo-800";
    case "holiday":
      return "bg-amber-200 text-amber-800";
    case "unavailable":
      return "bg-red-200 text-red-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

export function getAvailabilityModifierClass(reason: string): string {
  switch (reason) {
    case "booked":
      return "bg-indigo-100 text-indigo-800 rounded";
    case "holiday":
      return "bg-amber-100 text-amber-800 rounded";
    case "unavailable":
      return "bg-red-100 text-red-800 rounded";
    default:
      return "bg-slate-100 text-slate-700 rounded";
  }
}

export function reasonBadgeClass(reason: string): string {
  switch (reason) {
    case "booked":
      return "bg-indigo-100 text-indigo-800";
    case "holiday":
      return "bg-amber-100 text-amber-800";
    case "unavailable":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function getModifierDays(blocks: AvailabilityBlockLike[], reason: string): Date[] {
  return blocks
    .filter((b) => b.reason === reason)
    .flatMap((b) => {
      const dates: Date[] = [];
      const current = parseDateOnly(b.startDate);
      const end = parseDateOnly(b.endDate);
      current.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    });
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (start.getTime() === end.getTime()) {
    return format(start, "MMM d");
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "MMM d")}–${format(end, "d")}`;
  }
  return `${format(start, "MMM d")}–${format(end, "MMM d")}`;
}

export function toApiDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
