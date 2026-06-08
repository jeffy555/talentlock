import { Skeleton } from "@/components/ui/skeleton";
import { formatRate } from "@/lib/earningsFormat";
import type { EarningsIntelligenceRateBenchmark } from "@workspace/api-client-react";

interface RateBenchmarkCardProps {
  data: EarningsIntelligenceRateBenchmark | null | undefined;
  isLoading?: boolean;
}

function percentileLabel(percentile: number): { text: string; className: string } {
  if (percentile >= 75) {
    return { text: `Top ${100 - percentile}% in your field`, className: "text-emerald-600 font-semibold" };
  }
  if (percentile >= 50) {
    return { text: `Top ${100 - percentile}% in your field`, className: "text-blue-600 font-semibold" };
  }
  if (percentile >= 25) {
    return { text: "Bottom 50% in your field", className: "text-amber-600 font-semibold" };
  }
  return { text: "Bottom 25% in your field", className: "text-slate-500" };
}

export function RateBenchmarkCard({ data, isLoading }: RateBenchmarkCardProps) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Rate Benchmarking</h3>
        <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Rate benchmarking requires at least 3 freelancers with completed bookings in your field.
        </p>
      </div>
    );
  }

  const { text, className } = percentileLabel(data.percentile);
  const range = data.fieldMax - data.fieldMin;
  const position = range > 0 ? ((data.myRate - data.fieldMin) / range) * 100 : 50;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800">Rate Benchmarking</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {data.fieldOfWork} developers on TalentLock
      </p>

      <p className="text-sm text-slate-700 mt-4">
        Your rate: <span className="font-semibold">{formatRate(data.myRate)}</span>
      </p>
      <p className={`text-sm mt-1 ${className}`}>{text}</p>

      <div className="relative h-2 bg-slate-100 rounded-full my-3">
        <div
          className="absolute h-4 w-4 -top-1 rounded-full bg-indigo-500 border-2 border-white shadow"
          style={{ left: `calc(${Math.min(100, Math.max(0, position))}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatRate(data.fieldMin)}</span>
        <span>min — you — max</span>
        <span>{formatRate(data.fieldMax)}</span>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Field median: {formatRate(data.fieldMedian)} · {data.freelancerCount} freelancers
      </p>
    </div>
  );
}
