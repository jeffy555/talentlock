import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMPLETENESS_THRESHOLD_DASHBOARD,
  getCompletenessBreakdown,
} from "@/lib/completenessUtils";

interface ProfileStrengthChecklistProps {
  score: number;
  profile: {
    bio?: string | null;
    skills?: string[] | null;
    hourlyRate?: number | null;
    dailyRate?: number | null;
    paymentPreference?: string;
    fieldOfWork?: string | null;
    isAvailable?: boolean | null;
  };
  avatarUrl?: string | null;
}

export function ProfileStrengthChecklist({
  score,
  profile,
  avatarUrl,
}: ProfileStrengthChecklistProps) {
  if (score >= COMPLETENESS_THRESHOLD_DASHBOARD) return null;

  const items = getCompletenessBreakdown(profile, avatarUrl);
  if (items.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-gold/30 bg-gold/5 p-5 space-y-4"
      aria-label="Profile strength checklist"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            Strengthen your profile
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete these items to improve your Talent Vault ranking.
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">
          {score}% → {COMPLETENESS_THRESHOLD_DASHBOARD}%
        </p>
      </div>

      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-gold rounded-full h-2 transition-all duration-500"
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.field} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-foreground">{item.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-gold bg-gold/15 px-2 py-0.5 rounded-full">
                +{item.points}%
              </span>
              <Link href={item.href} className="text-xs text-primary underline flex items-center gap-0.5">
                Go
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Button variant="outline" asChild className="w-full sm:w-auto">
        <Link href="/profile">Complete profile →</Link>
      </Button>
    </section>
  );
}
