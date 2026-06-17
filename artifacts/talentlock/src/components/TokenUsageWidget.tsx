import { Link, useLocation } from "wouter";
import { useGetTokenUsageMe } from "@workspace/api-client-react";
import type { TokenUsageSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { nonZeroBreakdownEntries } from "@/lib/tokenUsageUtils";

export interface TokenUsageWidgetProps {
  variant?: "full" | "compact";
}

function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompactResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function currentMonthHeading(): string {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function usageMetrics(data: TokenUsageSummary) {
  const { monthlyTokenLimit, tokensUsed, resetDate } = data;
  const isUnlimited = monthlyTokenLimit === null;
  const usagePercent = isUnlimited
    ? null
    : Math.round((tokensUsed / monthlyTokenLimit) * 100);
  const daysRemaining = Math.ceil(
    (new Date(resetDate).getTime() - Date.now()) / 86400000,
  );
  const isAtLimit = !isUnlimited && tokensUsed >= monthlyTokenLimit;
  const isWarning = !isUnlimited && usagePercent !== null && usagePercent >= 80 && !isAtLimit;

  return {
    isUnlimited,
    usagePercent,
    daysRemaining,
    isAtLimit,
    isWarning,
    resetLabel: formatResetDate(resetDate),
    compactResetLabel: formatCompactResetDate(resetDate),
  };
}

function progressFillClass(isAtLimit: boolean, isWarning: boolean): string {
  if (isAtLimit) return "[&>div]:bg-red-500";
  if (isWarning) return "[&>div]:bg-amber-400";
  return "[&>div]:bg-emerald-500";
}

function FullLoadingSkeleton() {
  return (
    <Card className="shadow-sm border-border">
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-56" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-4 w-48" />
        <Separator />
        <div className="space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompactLoadingSkeleton() {
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="pt-6 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full" />
      </CardContent>
    </Card>
  );
}

function BreakdownRows({
  breakdown,
  isUnlimited,
}: {
  breakdown: TokenUsageSummary["breakdown"];
  isUnlimited: boolean;
}) {
  const entries = nonZeroBreakdownEntries(breakdown);
  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="space-y-2 text-sm">
      {entries.map(({ key, label, tokens }) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">
            {isUnlimited ? "No limit" : `${tokens.toLocaleString()} tokens`}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function UpgradeLink({ className }: { className?: string }) {
  return (
    <Button variant="link" size="sm" className={cn("h-auto p-0", className)} asChild>
      <Link href="/pricing">Upgrade Plan →</Link>
    </Button>
  );
}

function FullWidgetContent({ data }: { data: TokenUsageSummary }) {
  const {
    isUnlimited,
    usagePercent,
    daysRemaining,
    isAtLimit,
    isWarning,
    resetLabel,
  } = usageMetrics(data);

  if (isUnlimited) {
    return (
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg font-serif">
              AI Token Usage — {currentMonthHeading()}
            </CardTitle>
            <Badge variant="secondary">Unlimited</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your Enterprise plan includes unlimited AI token usage.
          </p>
          <Separator />
          <BreakdownRows breakdown={data.breakdown} isUnlimited />
        </CardContent>
      </Card>
    );
  }

  const percent = usagePercent ?? 0;

  return (
    <Card className="shadow-sm border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg font-serif">
            AI Token Usage — {currentMonthHeading()}
          </CardTitle>
          {isAtLimit ? (
            <Badge variant="destructive">Limit reached</Badge>
          ) : isWarning ? (
            <Badge variant="outline" className="border-amber-400 text-amber-700">
              {percent}% used
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={isAtLimit ? 100 : percent}
          className={cn("h-2", progressFillClass(isAtLimit, isWarning))}
          aria-label={`AI token usage: ${percent} percent`}
        />
        <p className="text-sm text-muted-foreground">
          {data.tokensUsed.toLocaleString()} of {data.monthlyTokenLimit!.toLocaleString()} tokens used
          {" · "}
          {percent}% used
        </p>
        <p className="text-sm text-muted-foreground">
          {isWarning
            ? `Resets on ${resetLabel} — ${daysRemaining} days remaining`
            : `Resets on ${resetLabel}`}
        </p>
        <Separator />
        <BreakdownRows breakdown={data.breakdown} isUnlimited={false} />
        {isWarning && (
          <div className="rounded-md bg-amber-50 p-3 text-amber-700 text-sm">
            ⚠️ You&apos;ve used {percent}% of your quota. Upgrade your plan to avoid AI disruptions.{" "}
            <UpgradeLink className="text-amber-700" />
          </div>
        )}
        {isAtLimit && (
          <div className="rounded-md bg-red-50 p-3 text-red-700 text-sm">
            🚫 You&apos;ve reached your monthly AI token limit. AI Talent Matching and Agreement
            Generation are paused until {resetLabel}. <UpgradeLink className="text-red-700" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompactWidgetContent({ data, onNavigate }: { data: TokenUsageSummary; onNavigate: () => void }) {
  const metrics = usageMetrics(data);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate();
    }
  };

  if (metrics.isUnlimited) {
    return (
      <Card
        className="shadow-sm border-border cursor-pointer hover:ring-1 hover:ring-border transition-shadow"
        role="button"
        tabIndex={0}
        onClick={onNavigate}
        onKeyDown={handleKeyDown}
      >
        <CardContent className="pt-6 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Unlimited</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Enterprise plan · AI usage unlimited</p>
        </CardContent>
      </Card>
    );
  }

  const percent = metrics.usagePercent ?? 0;

  return (
    <Card
      className="shadow-sm border-border cursor-pointer hover:ring-1 hover:ring-border transition-shadow"
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="pt-6 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          AI Tokens · {percent}% used
        </p>
        <Progress
          value={metrics.isAtLimit ? 100 : percent}
          className={cn("h-2", progressFillClass(metrics.isAtLimit, metrics.isWarning))}
          aria-label={`AI token usage: ${percent} percent`}
        />
        <p className="text-xs text-muted-foreground">
          {data.tokensUsed.toLocaleString()} / {data.monthlyTokenLimit!.toLocaleString()} · Resets{" "}
          {metrics.compactResetLabel}
        </p>
      </CardContent>
    </Card>
  );
}

export function TokenUsageWidget({ variant = "full" }: TokenUsageWidgetProps) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, refetch } = useGetTokenUsageMe();

  if (isLoading) {
    return variant === "compact" ? <CompactLoadingSkeleton /> : <FullLoadingSkeleton />;
  }

  if (isError || !data) {
    if (variant === "compact") {
      return (
        <Card className="shadow-sm border-border">
          <CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
            <p>AI Tokens · —</p>
            <p>— / — · Resets —</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="shadow-sm border-border">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Could not load usage data.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (variant === "compact") {
    return <CompactWidgetContent data={data} onNavigate={() => setLocation("/billing")} />;
  }

  return <FullWidgetContent data={data} />;
}
