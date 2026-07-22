import { formatRate, type RateType } from "@/lib/rateFormatUtils";
import { convertForDisplay } from "@/lib/currencyUtils";
import type { ExchangeRates } from "@/lib/currencyUtils";
import { cn } from "@/lib/utils";

export interface DualRateDisplayProps {
  amount: number;
  rateType: RateType;
  primaryCurrency: string;
  secondaryCurrency?: string;
  rates?: ExchangeRates | null;
  ratesSource?: ExchangeRates["source"];
  layout?: "inline" | "stacked";
  className?: string;
}

export function DualRateDisplay({
  amount,
  rateType,
  primaryCurrency,
  secondaryCurrency,
  rates,
  ratesSource,
  layout = "stacked",
  className,
}: DualRateDisplayProps) {
  const primary = formatRate(amount, rateType, primaryCurrency);
  const showSecondary =
    secondaryCurrency
    && secondaryCurrency !== primaryCurrency
    && rates?.rates;

  const converted = showSecondary
    ? convertForDisplay(amount, primaryCurrency, secondaryCurrency, rates.rates)
    : null;

  if (!showSecondary || converted == null) {
    return <span className={cn("font-semibold text-foreground", className)}>{primary}</span>;
  }

  const secondary = formatRate(converted, rateType, secondaryCurrency);
  const estimatedSuffix = ratesSource === "fallback" ? " (estimated rates)" : "";

  if (layout === "inline") {
    return (
      <span className={cn("font-semibold text-foreground", className)}>
        {primary}
        <span className="text-muted-foreground font-normal text-sm">
          {" · ≈ "}
          {secondary}
        </span>
      </span>
    );
  }

  return (
    <div className={cn("space-y-0.5", className)}>
      <div className="font-semibold text-foreground">{primary}</div>
      <div className="text-sm text-muted-foreground">
        ≈ {secondary}
        <span className="text-xs"> (indicative){estimatedSuffix}</span>
      </div>
    </div>
  );
}
