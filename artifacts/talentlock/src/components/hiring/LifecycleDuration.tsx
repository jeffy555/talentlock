import { Skeleton } from "@/components/ui/skeleton";
import type { HiringAnalyticsLifecycle } from "@workspace/api-client-react";

const WINDOW_LABELS: Record<string, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

type Trend = HiringAnalyticsLifecycle["trends"]["jobToFirstBooking"];

interface LifecycleDurationProps {
  lifecycle: HiringAnalyticsLifecycle | undefined;
  isLoading?: boolean;
}

function TrendIndicator({ trend }: { trend: Trend }) {
  if (trend === "faster") {
    return <span className="text-emerald-600 text-xs">▼ faster</span>;
  }
  if (trend === "slower") {
    return <span className="text-red-500 text-xs">▲ slower</span>;
  }
  if (trend === "same") {
    return <span className="text-slate-400 text-xs">─ same</span>;
  }
  return <span className="text-slate-300 text-xs">─</span>;
}

function DurationRow({
  label,
  duration,
  trend,
}: {
  label: string;
  duration: number | null | undefined;
  trend: Trend;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-800">
          {duration != null ? `${duration} days` : "—"}
        </span>
        <TrendIndicator trend={trend} />
      </div>
    </div>
  );
}

export function LifecycleDuration({ lifecycle, isLoading }: LifecycleDurationProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!lifecycle) return null;

  const windowLabel = WINDOW_LABELS[lifecycle.window] ?? lifecycle.window;
  const hasAnyDuration =
    lifecycle.jobToFirstBooking != null ||
    lifecycle.bookingToSigned != null ||
    lifecycle.signedToCompleted != null ||
    lifecycle.totalDuration != null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">
        Hiring Lifecycle <span className="text-slate-400 font-normal">· {windowLabel}</span>
      </h3>

      {!hasAnyDuration ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No completed bookings in this period.
          <br />
          Select a wider time window or wait for bookings to complete.
        </p>
      ) : (
        <div>
          <DurationRow
            label="Job posted → First booking:"
            duration={lifecycle.jobToFirstBooking}
            trend={lifecycle.trends.jobToFirstBooking}
          />
          <DurationRow
            label="Booking → Agreement signed:"
            duration={lifecycle.bookingToSigned}
            trend={lifecycle.trends.bookingToSigned}
          />
          <DurationRow
            label="Signed → Completed:"
            duration={lifecycle.signedToCompleted}
            trend={lifecycle.trends.signedToCompleted}
          />
          <div className="flex items-center justify-between py-2 mt-1 border-t border-slate-200">
            <span className="text-sm font-medium text-slate-700">Total (post to complete):</span>
            <span className="text-sm font-semibold text-slate-800">
              {lifecycle.totalDuration != null ? `${lifecycle.totalDuration} days` : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
