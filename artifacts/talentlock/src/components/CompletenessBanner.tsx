import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getMissingCompletenessFields } from "@/lib/completenessUtils";

const MISSING_LABELS: Record<string, { label: string; anchor: string; section: string }> = {
  photo: { label: "Add a profile photo", anchor: "account", section: "Account" },
  bio: { label: "Add a bio (min 50 characters)", anchor: "bio", section: "Bio" },
  skills: { label: "Add at least 2 skills", anchor: "skills", section: "Skills" },
  rate: { label: "Set your hourly rate", anchor: "rate", section: "Rate" },
  field: { label: "Set your field of work", anchor: "field", section: "Field" },
  availability: { label: "Set your availability", anchor: "availability", section: "Availability" },
};

interface CompletenessBannerProps {
  score: number;
  profile: {
    bio?: string | null;
    skills?: string[] | null;
    hourlyRate?: number | null;
    dailyRate?: number | null;
    paymentPreference?: string;
    fieldOfWork?: string | null;
    isAvailable?: boolean;
  };
  hasAvatar: boolean;
}

export function CompletenessBanner({ score, profile, hasAvatar }: CompletenessBannerProps) {
  if (score >= 100) return null;

  const missing = getMissingCompletenessFields(profile, hasAvatar);

  if (score >= 60) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Your profile is visible in Talent Vault ({score}%)
        </p>
        <p className="text-xs text-blue-800 mt-1">
          Complete the remaining fields to improve your ranking.
        </p>
        <div className="w-full bg-blue-100 rounded-full h-2 mt-3">
          <div
            className="bg-blue-500 rounded-full h-2 transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-xs text-blue-700 mt-1 text-right">{score}%</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Complete your profile to appear in Talent Vault
      </p>
      <p className="text-sm text-amber-800 mt-1">
        Your profile is {score}% complete. You need 60% to appear in employer searches.
      </p>
      {missing.length > 0 && (
        <ul className="mt-3 space-y-1">
          {missing.map((field) => {
            const meta = MISSING_LABELS[field];
            return (
              <li key={field} className="flex items-center justify-between text-sm text-amber-800 py-1">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {meta.label}
                </span>
                <a href={`#${meta.anchor}`} className="text-xs text-amber-700 underline">
                  → {meta.section}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <div className="w-full bg-amber-100 rounded-full h-2 mt-3">
        <div
          className="bg-amber-500 rounded-full h-2 transition-all duration-500"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-amber-700 mt-1 text-right">{score}%</p>
    </div>
  );
}
