import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { currencySymbol } from "@/lib/currencyUtils";

interface EarningsTrendChartProps {
  months: string[];
  freelancerEarnings: number[];
  platformAverage: (number | null)[];
  fieldOfWork: string;
  currencyCode?: string;
  isLoading?: boolean;
}

export function EarningsTrendChart({
  months,
  freelancerEarnings,
  platformAverage,
  fieldOfWork,
  currencyCode = "USD",
  isLoading,
}: EarningsTrendChartProps) {
  const sym = currencySymbol(currencyCode);
  const platformAvailable = platformAverage.some((v) => v != null);
  const hasEarnings = freelancerEarnings.some((v) => v > 0);

  const chartData = useMemo(
    () =>
      months.map((month, i) => ({
        month,
        myEarnings: freelancerEarnings[i] ?? 0,
        platformAvg: platformAverage[i] ?? null,
      })),
    [months, freelancerEarnings, platformAverage],
  );

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-lg" />;
  }

  if (!hasEarnings) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Earnings Trend</h3>
        <div className="text-sm text-muted-foreground text-center py-6">
          <BarChart3 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p>No earnings data yet.</p>
          <p className="text-xs mt-1">Complete your first milestone to see your trend.</p>
        </div>
      </div>
    );
  }

  const platformLabel = fieldOfWork ? `${fieldOfWork} average` : "Platform average";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Earnings Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickFormatter={(v) => (v >= 1000 ? `${sym}${(v / 1000).toFixed(0)}k` : `${sym}${v}`)}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              const label = name === "myEarnings" ? "Your earnings" : platformLabel;
              return [`${sym}${Number(value).toLocaleString()}`, label];
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="myEarnings"
            name="Your earnings"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ fill: "#6366f1", r: 3 }}
            activeDot={{ r: 5 }}
          />
          {platformAvailable && (
            <Line
              type="monotone"
              dataKey="platformAvg"
              name={platformLabel}
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {!platformAvailable && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Platform average not available — fewer than 5 freelancers have earnings data in your
          field.
        </p>
      )}
    </div>
  );
}
