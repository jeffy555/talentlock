import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/earningsFormat";
import type { SpendAnalyticsFieldSpend } from "@workspace/api-client-react";

interface SpendByFieldChartProps {
  data: SpendAnalyticsFieldSpend[];
  isLoading?: boolean;
}

export function SpendByFieldChart({ data, isLoading }: SpendByFieldChartProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Spend by Field</h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          No spend breakdown yet.
          <br />
          Complete your first booking to see spending by field.
        </p>
      </div>
    );
  }

  if (data.length === 1) {
    const field = data[0];
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Spend by Field</h3>
        <p className="text-sm text-muted-foreground">
          All spend is in {field.field}.
        </p>
        <p className="text-lg font-semibold text-slate-800 mt-2">
          {formatCurrency(field.totalSpend)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Spend by Field</h3>
      <div>
        {data.map((item) => (
          <div
            key={item.field}
            className="grid grid-cols-[10rem_5rem_3rem_1fr] gap-2 items-center py-2"
          >
            <span className="text-sm text-slate-700 truncate">{item.field}</span>
            <span className="text-sm font-medium text-slate-800 text-right tabular-nums">
              {formatCurrency(item.totalSpend)}
            </span>
            <span className="text-xs text-muted-foreground text-right tabular-nums">
              {item.percentageOfTotal}%
            </span>
            <div className="bg-slate-100 rounded-full h-2">
              <div
                className="bg-indigo-400 rounded-full h-2"
                style={{ width: `${item.percentageOfTotal}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
