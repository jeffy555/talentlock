import { Badge } from "@/components/ui/badge";
import {
  LEGAL_FINANCE_QUALIFICATION_LABELS,
  PREFERRED_ENGAGEMENT_MODE_LABELS,
} from "@/lib/legalFinanceDisplayUtils";
import type { LegalFinanceQualification, PreferredEngagementMode } from "@workspace/api-client-react";

export interface LegalFinanceProfileView {
  practiceAreas?: string[] | null;
  practiceSettings?: string[] | null;
  yearsPracticeExperience?: number | null;
  legalFinanceHighestQualification?: LegalFinanceQualification | string | null;
  legalFinanceQualificationSpecialization?: string | null;
  legalFinanceQualificationInstitution?: string | null;
  enrolmentBody?: string | null;
  enrolmentNumber?: string | null;
  courtJurisdictions?: string[] | null;
  preferredEngagementMode?: PreferredEngagementMode | string | null;
}

export function LegalFinanceProfileSection({ profile }: { profile: LegalFinanceProfileView }) {
  const qualification = profile.legalFinanceHighestQualification
    ? (LEGAL_FINANCE_QUALIFICATION_LABELS[profile.legalFinanceHighestQualification as LegalFinanceQualification]
      ?? profile.legalFinanceHighestQualification)
    : null;

  return (
    <section className="space-y-4">
      <h3 className="font-serif text-2xl font-semibold text-foreground">Practice profile</h3>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {profile.practiceAreas && profile.practiceAreas.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Practice areas
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.practiceAreas.map((item) => (
                <Badge key={item} variant="secondary" className="bg-slate-100 text-slate-800 border-slate-300">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {profile.practiceSettings && profile.practiceSettings.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Practice settings
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.practiceSettings.map((item) => (
                <Badge key={item} variant="secondary">{item}</Badge>
              ))}
            </div>
          </div>
        )}
        {qualification && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Qualification
            </p>
            <p className="text-foreground font-medium">
              {qualification}
              {profile.legalFinanceQualificationSpecialization
                ? ` — ${profile.legalFinanceQualificationSpecialization}`
                : ""}
            </p>
            {profile.legalFinanceQualificationInstitution && (
              <p className="text-muted-foreground">{profile.legalFinanceQualificationInstitution}</p>
            )}
          </div>
        )}
        {(profile.enrolmentBody || profile.enrolmentNumber) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Enrolment / membership number
            </p>
            <p className="text-foreground font-medium">
              {profile.enrolmentBody ?? "Enrolment body not specified"}
            </p>
            {profile.enrolmentNumber && (
              <p className="text-muted-foreground">No. {profile.enrolmentNumber}</p>
            )}
          </div>
        )}
        {profile.courtJurisdictions && profile.courtJurisdictions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Court jurisdictions
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.courtJurisdictions.map((item) => (
                <Badge key={item} variant="secondary">{item}</Badge>
              ))}
            </div>
          </div>
        )}
        {profile.preferredEngagementMode && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Engagement mode
            </p>
            <p className="text-foreground font-medium">
              {PREFERRED_ENGAGEMENT_MODE_LABELS[profile.preferredEngagementMode]
                ?? profile.preferredEngagementMode}
            </p>
          </div>
        )}
        {profile.yearsPracticeExperience != null && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Years of practice
            </p>
            <p className="text-foreground font-medium">
              {profile.yearsPracticeExperience} years
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
