import { useGetDashboardSpendAnalytics } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SpendSummaryCards } from "./SpendSummaryCards";
import { SpendTrendChart } from "./SpendTrendChart";
import { SpendByFieldChart } from "./SpendByFieldChart";
import { TopFreelancersCard } from "./TopFreelancersCard";
import { CommittedSpendCard } from "./CommittedSpendCard";
import { RateBenchmarkCard } from "./RateBenchmarkCard";

export function SpendAnalyticsPanel() {
  const { data, isLoading, isError, refetch } = useGetDashboardSpendAnalytics();
  const currencyCode = data?.displayCurrency ?? "USD";

  if (isError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load spend analytics.{" "}
          <Button
            variant="link"
            className="h-auto p-0 text-blue-600"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SpendSummaryCards
        thisMonth={data?.summary.thisMonth ?? 0}
        lastMonth={data?.summary.lastMonth ?? 0}
        allTime={data?.summary.allTime ?? 0}
        monthOverMonthChange={data?.summary.monthOverMonthChange ?? null}
        currencyCode={currencyCode}
        isLoading={isLoading}
      />
      {data?.conversionNote && (
        <p className="text-xs text-muted-foreground">{data.conversionNote}</p>
      )}
      <SpendTrendChart
        months={data?.trend.months ?? []}
        spend={data?.trend.spend ?? []}
        currencyCode={currencyCode}
        isLoading={isLoading}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SpendByFieldChart data={data?.spendByField ?? []} currencyCode={currencyCode} isLoading={isLoading} />
        <CommittedSpendCard
          committedAmount={data?.committed.committedAmount ?? 0}
          milestoneCount={data?.committed.milestoneCount ?? 0}
          currencyCode={currencyCode}
          isLoading={isLoading}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopFreelancersCard freelancers={data?.topFreelancers ?? []} currencyCode={currencyCode} isLoading={isLoading} />
        <RateBenchmarkCard data={data?.rateBenchmark} currencyCode={currencyCode} isLoading={isLoading} />
      </div>
    </div>
  );
}
