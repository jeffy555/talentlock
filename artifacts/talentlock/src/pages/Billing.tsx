import { Link } from "wouter";
import { useGetMe, useGetMySubscription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { CreditCard, ArrowUpRight, ShieldCheck } from "lucide-react";

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  const atLimit = !isUnlimited && used >= limit;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${atLimit ? "text-destructive" : ""}`}>
          {used} {isUnlimited ? "" : `/ ${limit}`}{isUnlimited && <span className="text-gold ml-1">unlimited</span>}
        </span>
      </div>
      {!isUnlimited && <Progress value={pct} className="h-2" />}
    </div>
  );
}

export default function Billing() {
  const { data: user } = useGetMe();
  const { data: sub, isLoading } = useGetMySubscription({ query: { enabled: !!user } as any });

  if (isLoading || !sub) {
    return <div className="text-center text-muted-foreground py-12">Loading billing…</div>;
  }

  const plan = sub.plan;
  const isFree = plan.id === "free" || plan.id === "freelancer_free";
  const isFreelancer = user?.role === "freelancer";

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="font-serif text-3xl font-bold">Billing & Plan</h1>
        <p className="text-muted-foreground">Your current subscription, usage, and upgrade options.</p>
      </div>

      <Card className="shadow-sm border-border bg-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-gold" />
                <CardTitle className="font-serif">{plan.name}</CardTitle>
                <Badge variant={isFree ? "outline" : "default"} className={isFree ? "" : "bg-gold/10 text-gold border-gold/30"}>
                  {sub.status}
                </Badge>
              </div>
              <CardDescription className="mt-1">{plan.tagline}</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {plan.priceMonthly > 0 ? `$${plan.priceMonthly}` : plan.id === "employer_enterprise" ? "Custom" : "$0"}
                <span className="text-sm text-muted-foreground font-normal">/mo</span>
              </div>
              {sub.currentPeriodEnd && (
                <div className="text-xs text-muted-foreground mt-1">
                  Renews {format(new Date(sub.currentPeriodEnd), "MMM d, yyyy")}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Usage this period</h3>
            {!isFreelancer && (
              <>
                <UsageRow label="Active bookings" used={sub.usage.activeBookings} limit={plan.limits.activeBookings ?? null} />
                <UsageRow label="Job posts this month" used={sub.usage.monthlyJobPosts} limit={plan.limits.monthlyJobPosts ?? null} />
              </>
            )}
            {isFreelancer && (
              <>
                <UsageRow label="Active engagements" used={sub.usage.activeBookings} limit={plan.limits.activeBookings ?? null} />
                <UsageRow label="Express Interest pitches this month" used={sub.usage.monthlyExpressInterests} limit={plan.limits.monthlyExpressInterests ?? null} />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
            <Link href="/pricing">
              <Button className="bg-primary text-white hover:bg-primary/90">
                <ArrowUpRight className="h-4 w-4 mr-2" />
                {isFree ? "Choose a Plan" : "Change Plan"}
              </Button>
            </Link>
            <Button variant="outline" disabled>
              <CreditCard className="h-4 w-4 mr-2" />
              Payment Methods
            </Button>
          </div>

          <div className="text-xs text-muted-foreground bg-secondary/50 border border-border rounded-md p-3">
            <strong className="text-foreground">Demo build:</strong> simulated checkout — no card required.
            Production swaps in Stripe Billing (Checkout + Customer Portal) plus a 5–10% transaction fee on completed engagements via Stripe Connect escrow (Phase 3).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
