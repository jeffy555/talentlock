import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import type { SpendAnalyticsTopFreelancer } from "@workspace/api-client-react";

interface TopFreelancersCardProps {
  freelancers: SpendAnalyticsTopFreelancer[];
  isLoading?: boolean;
}

export function TopFreelancersCard({ freelancers, isLoading }: TopFreelancersCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (freelancers.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Top Freelancers by Spend</h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          No completed bookings yet.
          <br />
          Your top freelancers by spend will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">Top Freelancers by Spend</h3>
      <div>
        {freelancers.map((freelancer, index) => (
          <div
            key={freelancer.freelancerId}
            className="flex items-start justify-between py-3 border-b border-slate-50 last:border-0"
          >
            <div className="flex items-start gap-3">
              <span className="text-sm font-medium text-slate-400 w-4">{index + 1}</span>
              <div>
                <p className="text-sm font-medium text-slate-800">{freelancer.name}</p>
                <p className="text-xs text-muted-foreground">
                  {freelancer.fieldOfWork}
                  {freelancer.averageRatingGiven != null
                    ? ` · ★ ${freelancer.averageRatingGiven.toFixed(1)}`
                    : " · No review"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {freelancer.bookingCount} booking
                  {freelancer.bookingCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-sm font-semibold text-slate-800">
                ${freelancer.totalPaid.toLocaleString()}
              </p>
              <Link
                href={`/freelancers/${freelancer.freelancerId}`}
                className="text-xs text-indigo-600 hover:underline"
              >
                View Profile →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
