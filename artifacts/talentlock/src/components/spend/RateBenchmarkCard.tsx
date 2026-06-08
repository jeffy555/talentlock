import { Skeleton } from "@/components/ui/skeleton";
import { formatRate } from "@/lib/earningsFormat";
import type { SpendAnalyticsRateBenchmark } from "@workspace/api-client-react";

interface RateBenchmarkCardProps {
  data: SpendAnalyticsRateBenchmark | null | undefined;
  isLoading?: boolean;
}

function overallBadge(differencePercent: number): { text: string; className: string } {
  if (differencePercent > 10) {
    return { text: "You may be overpaying", className: "text-red-500" };
  }
  if (differencePercent < -10) {
    return { text: "Below market rate", className: "text-emerald-600" };
  }
  return { text: "At market rate", className: "text-slate-600" };
}

function fieldComparison(differencePercent: number): { text: string; className: string } {
  if (differencePercent > 5) {
    return {
      text: `▲ ${Math.abs(differencePercent)}% above market`,
      className: "text-red-500",
    };
  }
  if (differencePercent < -5) {
    return {
      text: `▼ ${Math.abs(differencePercent)}% below market`,
      className: "text-emerald-600",
    };
  }
  return { text: "─ At market", className: "text-slate-500" };
}

export function RateBenchmarkCard({ data, isLoading }: RateBenchmarkCardProps) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800">Rate Analysis</h3>
        <p className="text-sm text-muted-foreground mt-4">Not enough data yet.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Rate analysis requires completed bookings and sufficient market data in your fields.
        </p>
      </div>
    );
  }

  const overallDiff =
    data.marketMedian > 0
      ? Math.round(((data.averageRatePaid - data.marketMedian) / data.marketMedian) * 100)
      : 0;
  const overall = overallBadge(overallDiff);

  let overallTrendText: string;
  let overallTrendClass: string;
  if (overallDiff > 5) {
    overallTrendText = `▲ ${Math.abs(overallDiff)}% above market`;
    overallTrendClass = "text-red-500";
  } else if (overallDiff < -5) {
    overallTrendText = `▼ ${Math.abs(overallDiff)}% below market`;
    overallTrendClass = "text-emerald-600";
  } else {
    overallTrendText = "─ At market rate";
    overallTrendClass = "text-slate-500";
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800">Rate Analysis</h3>
      <p className="text-sm text-muted-foreground mt-1">How your rates compare to market</p>

      <div className="mt-4 space-y-1">
        <p className="text-sm text-slate-700">
          Your avg paid: <span className="font-semibold">{formatRate(data.averageRatePaid)}</span>
        </p>
        <p className="text-sm text-slate-700">
          Market median: <span className="font-semibold">{formatRate(data.marketMedian)}</span>
        </p>
        <p className={`text-sm font-medium ${overallTrendClass}`}>{overallTrendText}</p>
        <p className={`text-xs ${overall.className}`}>{overall.text}</p>
      </div>

      {data.fields.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-600 mb-2">By field:</p>
          <div className="space-y-2">
            {data.fields.map((field) => {
              const comparison = fieldComparison(field.differencePercent);
              return (
                <div
                  key={field.field}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-slate-700 truncate">{field.field}</span>
                  <span className="text-slate-600 shrink-0 tabular-nums">
                    {formatRate(field.avgPaid)}
                  </span>
                  <span className={`shrink-0 ${comparison.className}`}>{comparison.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
