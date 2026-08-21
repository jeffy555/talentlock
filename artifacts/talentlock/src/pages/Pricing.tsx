import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useListPlans,
  useGetMySubscription,
  useUpgradeSubscription,
  getGetMySubscriptionQueryKey,
  type ListPlansCurrency,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Sparkles, Crown, Building2, User as UserIcon } from "lucide-react";
import { PREMIUM_FEATURES_FREE } from "@/lib/planAccess";
import {
  PLAN_DISPLAY_CURRENCIES,
  type PlanDisplayCurrency,
  formatPlanPrice,
  formatPlanPriceSrLabel,
  planDisplayCurrency,
  readStoredPricingCurrency,
  storePricingCurrency,
} from "@/lib/planPriceFormat";
import { currencySymbol } from "@/lib/currencyUtils";

const CURRENCY_TOGGLE: { code: PlanDisplayCurrency; label: string }[] = PLAN_DISPLAY_CURRENCIES.map(
  (code) => ({
    code,
    label: code === "USD" ? "USD $" : code === "EUR" ? "EUR €" : "INR ₹",
  }),
);

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const audience = user?.role === "freelancer" ? "freelancer" : user?.role === "employer" ? "employer" : "any";

  const [currency, setCurrency] = useState<PlanDisplayCurrency>(
    () => readStoredPricingCurrency() ?? "USD",
  );

  useEffect(() => {
    if (readStoredPricingCurrency()) return;
    if (user?.currencyCode) {
      setCurrency(planDisplayCurrency(user.currencyCode));
    }
  }, [user?.currencyCode]);

  const selectCurrency = (next: PlanDisplayCurrency) => {
    setCurrency(next);
    storePricingCurrency(next);
  };

  const {
    data: plans,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useListPlans({
    audience,
    currency: currency as ListPlansCurrency,
  });
  const { data: mySub } = useGetMySubscription({ query: { enabled: !!user } as any });
  const upgrade = useUpgradeSubscription();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const handleUpgrade = async (planId: string) => {
    if (!user) {
      setLocation("/sign-in");
      return;
    }
    setPendingPlan(planId);
    try {
      await upgrade.mutateAsync({ data: { planId } });
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
      toast({ title: "Plan activated", description: "Your new plan is live. Welcome aboard." });
      setLocation("/billing");
    } catch (err: any) {
      toast({
        title: "Upgrade failed",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      <div className="text-center space-y-3">
        <Badge className="bg-gold/10 text-gold border-gold/30">Phase 2 — Live Subscriptions</Badge>
        <h1 className="font-serif text-4xl font-bold">Choose your plan</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Premium positioning, exclusivity protection, and AI-drafted contracts — priced for individuals through
          enterprise. A {user?.role === "freelancer" ? "5% transaction fee" : "5–10% platform fee"} on completed
          engagements applies in Phase 3 when escrow ships.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 sm:gap-3">
        <span className="text-sm text-muted-foreground text-center sm:text-left">Prices in:</span>
        <div
          role="radiogroup"
          aria-label="Subscription price currency"
          className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid rounded-md border border-border overflow-hidden"
        >
          {CURRENCY_TOGGLE.map(({ code, label }) => {
            const active = currency === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectCurrency(code)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <div className="text-center text-muted-foreground">Loading plans…</div>}

      {isError && (
        <div className="text-center space-y-3 py-6">
          <p className="text-sm text-destructive">Could not load plans. Please try again.</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div
          className={`grid gap-6 ${plans && plans.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3"}`}
        >
          {plans?.map((plan) => {
            const isCurrent = mySub?.plan?.id === plan.id;
            const isHighlight = plan.id === "freelancer_pro" || plan.id === "employer_growth";
            const Icon =
              plan.audience === "freelancer"
                ? UserIcon
                : plan.id === "employer_enterprise"
                  ? Crown
                  : Building2;
            const displayCurrency = (plan.displayCurrency ?? currency) as PlanDisplayCurrency;
            const priceLabel = formatPlanPrice(plan.priceMonthly, displayCurrency);
            const isPaid = (plan.priceMonthly ?? 0) > 0;

            return (
              <Card
                key={plan.id}
                className={`relative shadow-sm border-border bg-card flex flex-col ${
                  isHighlight ? "border-gold/50 shadow-lg" : ""
                }`}
              >
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gold text-primary border-0 shadow">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 text-gold mb-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="font-serif">{plan.name}</CardTitle>
                  <CardDescription>{plan.tagline}</CardDescription>
                  <div className="pt-3">
                    {isPaid ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold tabular-nums">{priceLabel}</span>
                        <span className="sr-only">
                          {formatPlanPriceSrLabel(plan.priceMonthly, displayCurrency)}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                    ) : plan.id === "employer_enterprise" && !PREMIUM_FEATURES_FREE ? (
                      <div className="text-3xl font-bold">Custom</div>
                    ) : (
                      <div className="text-4xl font-bold">Free</div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-gold flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button disabled className="w-full" variant="outline">
                      Current Plan
                    </Button>
                  ) : plan.id === "employer_enterprise" && !PREMIUM_FEATURES_FREE ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() =>
                        toast({
                          title: "Contact sales",
                          description:
                            "Email enterprise@talentlock.com — we'll be in touch within one business day.",
                        })
                      }
                    >
                      Contact Sales
                    </Button>
                  ) : (
                    <Button
                      className={`w-full ${isHighlight ? "bg-gold text-primary hover:bg-gold/90" : ""}`}
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={pendingPlan === plan.id}
                    >
                      {pendingPlan === plan.id
                        ? "Activating…"
                        : (plan.priceMonthly ?? 0) === 0
                          ? "Start Free"
                          : "Upgrade"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground max-w-2xl mx-auto space-y-2 pt-4 border-t border-border">
        <p>
          Prices shown in {currency} ({currencySymbol(currency)}). Your account location sets the default. Engagement
          rates (freelancer day/hour rates) use each talent&apos;s own currency and are separate from subscription
          pricing.
        </p>
        <p>
          Demo note: this build uses simulated checkout so judges can exercise gating without entering payment details.
          Production launch swaps in Stripe Billing (Checkout + Customer Portal) at the same endpoints — no UI changes
          required.
        </p>
      </div>
    </div>
  );
}

