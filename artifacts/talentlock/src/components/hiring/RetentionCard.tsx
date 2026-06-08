import { Link } from "wouter";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { HiringAnalyticsRetention } from "@workspace/api-client-react";

interface RetentionCardProps {
  retention: HiringAnalyticsRetention | undefined;
  isLoading?: boolean;
}

export function RetentionCard({ retention, isLoading }: RetentionCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-40 w-40 rounded-full mx-auto mb-4" />
        <Skeleton className="h-8 w-full mb-2" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!retention || retention.totalBookings === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Freelancer Retention</h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          No completed bookings yet.
          <br />
          Retention data will appear after your first completed booking.
        </p>
      </div>
    );
  }

  const pieData = [
    { name: "Repeat", value: retention.repeatRate },
    { name: "New", value: retention.newRate },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Freelancer Retention</h3>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                innerRadius={50}
                outerRadius={70}
                startAngle={90}
                endAngle={-270}
                paddingAngle={2}
              >
                <Cell fill="#6366f1" />
                <Cell fill="#e2e8f0" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-indigo-700">{retention.repeatRate}%</span>
          </div>
        </div>
        <div className="space-y-1 text-sm flex-1">
          <p className="text-slate-700">
            <span className="text-muted-foreground">Repeat:</span>{" "}
            <span className="font-semibold">{retention.repeatRate}%</span>
          </p>
          <p className="text-slate-700">
            <span className="text-muted-foreground">New:</span>{" "}
            <span className="font-semibold">{retention.newRate}%</span>
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            {retention.totalBookings} total booking{retention.totalBookings !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {retention.repeatFreelancers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-600 mb-2">Top repeat freelancers:</p>
          <div className="space-y-2">
            {retention.repeatFreelancers.map((f) => (
              <div
                key={f.freelancerId}
                className="flex items-center justify-between text-sm gap-2"
              >
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{f.name}</span>
                  <span className="text-muted-foreground text-xs ml-2">{f.fieldOfWork}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {f.bookingCount} booking{f.bookingCount !== 1 ? "s" : ""}
                  </span>
                  <Link
                    href={`/freelancers/${f.freelancerId}`}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
