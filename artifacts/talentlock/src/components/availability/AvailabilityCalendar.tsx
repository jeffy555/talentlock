import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNextAvailable } from "@/lib/availabilityUtils";
import { AvailabilityCalendarGrid } from "./AvailabilityCalendarGrid";

interface AvailabilityCalendarProps {
  blocks: { startDate: string; endDate: string; reason: string }[];
  nextAvailableDate: string | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function AvailabilityCalendar({
  blocks,
  nextAvailableDate,
  isLoading,
  isError,
  onRetry,
}: AvailabilityCalendarProps) {
  if (isLoading) {
    return <Skeleton className="h-[260px] w-full rounded-lg" />;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-border p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Could not load availability.</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">Availability</h3>
      <p className="text-sm text-slate-600 mb-3">
        Next available:{" "}
        <span className={`font-medium ${nextAvailableDate ? "text-emerald-700" : "text-slate-400"}`}>
          {formatNextAvailable(nextAvailableDate)}
        </span>
      </p>

      <AvailabilityCalendarGrid blocks={blocks} />

      <div className="flex gap-3 mt-3 flex-wrap">
        {[
          { label: "Booked", colour: "bg-indigo-200" },
          { label: "Holiday", colour: "bg-amber-200" },
          { label: "Unavailable", colour: "bg-red-200" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1 text-xs text-slate-500">
            <span className={`h-3 w-3 rounded-sm ${item.colour}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
