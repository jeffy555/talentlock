import { useState } from "react";
import { Link } from "wouter";
import { useGetTokenUsageMe } from "@workspace/api-client-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "tl_token_banner_dismissed";

function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function TokenUsageBanner() {
  const { data, isLoading, isError } = useGetTokenUsageMe();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "true",
  );

  if (isLoading || isError || !data) return null;

  const { monthlyTokenLimit, tokensUsed, resetDate } = data;
  const sessionDismissed = dismissed;
  const shouldShow =
    monthlyTokenLimit !== null &&
    tokensUsed / monthlyTokenLimit >= 0.8 &&
    !sessionDismissed;

  if (!shouldShow) return null;

  const usagePercent = Math.round((tokensUsed / monthlyTokenLimit) * 100);
  const isAtLimit = tokensUsed >= monthlyTokenLimit;
  const resetLabel = formatResetDate(resetDate);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  return (
    <Alert
      className={
        isAtLimit
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }
    >
      <AlertDescription>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <p className="text-sm leading-relaxed pr-2">
            {isAtLimit ? (
              <>
                🚫 You&apos;ve reached your monthly AI token limit. AI features are paused until{" "}
                {resetLabel}. Upgrade to restore access immediately.
              </>
            ) : (
              <>
                ⚠️ You&apos;ve used {usagePercent}% of your monthly AI token quota. Upgrade your
                plan to keep using AI Matching and Agreement Generation without interruption.
              </>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href="/pricing">Upgrade Plan</Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDismiss} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
