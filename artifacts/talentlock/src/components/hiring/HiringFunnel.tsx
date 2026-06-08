import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { HiringAnalyticsFunnel } from "@workspace/api-client-react";

const WINDOW_LABELS: Record<string, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

interface HiringFunnelProps {
  funnel: HiringAnalyticsFunnel | undefined;
  isLoading?: boolean;
}

function StageBox({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-6 py-4 text-center min-w-[100px]">
        <p className="text-2xl font-bold text-indigo-700">{count}</p>
        <p className="text-xs text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

function ConversionLabel({ rate, suffix }: { rate: number | null; suffix: string }) {
  return (
    <p className="text-xs text-slate-500 text-center mt-1 min-w-[80px]">
      {rate !== null ? `${rate}% ${suffix}` : "—"}
    </p>
  );
}

export function HiringFunnel({ funnel, isLoading }: HiringFunnelProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="flex flex-wrap items-center justify-center gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-[100px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!funnel) return null;

  const windowLabel = WINDOW_LABELS[funnel.window] ?? funnel.window;
  const hasActivity =
    funnel.jobsPosted > 0 ||
    funnel.bookingsCreated > 0 ||
    funnel.agreementsSigned > 0 ||
    funnel.completed > 0;

  const { conversionRates } = funnel;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-800 mb-4">
        Hiring Funnel <span className="text-slate-400 font-normal">· {windowLabel}</span>
      </h3>

      {!hasActivity ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hiring activity in the selected period.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
            <StageBox count={funnel.jobsPosted} label="Jobs Posted" />
            <div className="flex flex-col items-center">
              <ChevronRight className="h-5 w-5 text-slate-300" />
              <ConversionLabel rate={conversionRates.jobToBooking} suffix="converted" />
            </div>
            <StageBox count={funnel.bookingsCreated} label="Bookings Created" />
            <div className="flex flex-col items-center">
              <ChevronRight className="h-5 w-5 text-slate-300" />
              <ConversionLabel rate={conversionRates.bookingToSigned} suffix="to signed" />
            </div>
            <StageBox count={funnel.agreementsSigned} label="Agreements Signed" />
            <div className="flex flex-col items-center">
              <ChevronRight className="h-5 w-5 text-slate-300" />
              <ConversionLabel rate={conversionRates.signedToCompleted} suffix="completed" />
            </div>
            <StageBox count={funnel.completed} label="Completed" />
          </div>
        </div>
      )}
    </div>
  );
}
