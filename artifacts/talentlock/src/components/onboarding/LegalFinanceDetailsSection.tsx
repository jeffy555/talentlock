import ChipInput from "@/components/ChipInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Scale } from "lucide-react";
import type {
  LegalFinanceProfessionType,
  LegalFinanceQualification,
  PreferredEngagementMode,
} from "@workspace/api-client-react";
import { LEGAL_FINANCE_QUALIFICATION_LABELS } from "@/lib/legalFinanceDisplayUtils";

export interface LegalFinanceDetailsValues {
  practiceAreas: string[];
  practiceSettings: string[];
  yearsPracticeExperience: number | null;
  legalFinanceHighestQualification: LegalFinanceQualification | null;
  legalFinanceQualificationSpecialization: string;
  legalFinanceQualificationInstitution: string;
  enrolmentBody: string;
  enrolmentNumber: string;
  enrolmentExpiry: string;
  courtJurisdictions: string[];
  preferredEngagementMode: PreferredEngagementMode | null;
}

export function emptyLegalFinanceDetails(): LegalFinanceDetailsValues {
  return {
    practiceAreas: [],
    practiceSettings: [],
    yearsPracticeExperience: null,
    legalFinanceHighestQualification: null,
    legalFinanceQualificationSpecialization: "",
    legalFinanceQualificationInstitution: "",
    enrolmentBody: "",
    enrolmentNumber: "",
    enrolmentExpiry: "",
    courtJurisdictions: [],
    preferredEngagementMode: null,
  };
}

interface LegalFinanceDetailsSectionProps {
  legalFinanceProfessionType: LegalFinanceProfessionType | null;
  values: LegalFinanceDetailsValues;
  onChange: (values: LegalFinanceDetailsValues) => void;
}

export default function LegalFinanceDetailsSection({
  legalFinanceProfessionType,
  values,
  onChange,
}: LegalFinanceDetailsSectionProps) {
  const set = <K extends keyof LegalFinanceDetailsValues>(key: K, val: LegalFinanceDetailsValues[K]) => {
    onChange({ ...values, [key]: val });
  };

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Practice details
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <Label>Practice areas <span className="text-red-600">*</span></Label>
          <ChipInput
            value={values.practiceAreas}
            onChange={(v) => set("practiceAreas", v)}
            placeholder="e.g. Corporate, GST, M&A"
          />
        </div>

        <div className="space-y-2">
          <Label>Practice settings</Label>
          <ChipInput
            value={values.practiceSettings}
            onChange={(v) => set("practiceSettings", v)}
            placeholder="e.g. Law firm, Chambers, Independent practice"
          />
        </div>

        <div className="space-y-2">
          <Label>Years of practice</Label>
          <Input
            type="number"
            min={0}
            value={values.yearsPracticeExperience ?? ""}
            onChange={(e) =>
              set("yearsPracticeExperience", e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className="w-24"
          />
        </div>

        <div className="space-y-2">
          <Label>Highest qualification</Label>
          <Select
            value={values.legalFinanceHighestQualification ?? ""}
            onValueChange={(v) =>
              set("legalFinanceHighestQualification", (v as LegalFinanceQualification) || null)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select qualification" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LEGAL_FINANCE_QUALIFICATION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Specialization</Label>
            <Input
              value={values.legalFinanceQualificationSpecialization}
              onChange={(e) => set("legalFinanceQualificationSpecialization", e.target.value)}
              placeholder="e.g. Indirect tax"
            />
          </div>
          <div className="space-y-2">
            <Label>Institution</Label>
            <Input
              value={values.legalFinanceQualificationInstitution}
              onChange={(e) => set("legalFinanceQualificationInstitution", e.target.value)}
              placeholder="e.g. NLSIU Bangalore"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Enrolment body</Label>
          <Input
            value={values.enrolmentBody}
            onChange={(e) => set("enrolmentBody", e.target.value)}
            placeholder="e.g. Bar Council of Maharashtra & Goa"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Enrolment / membership number</Label>
            <Input
              value={values.enrolmentNumber}
              onChange={(e) => set("enrolmentNumber", e.target.value)}
              placeholder="Enrolment or membership ID"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>Enrolment / COP expiry (optional)</Label>
            <Input
              type="date"
              value={values.enrolmentExpiry}
              onChange={(e) => set("enrolmentExpiry", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Court jurisdictions
            {legalFinanceProfessionType !== "advocate" ? " (optional)" : ""}
          </Label>
          <ChipInput
            value={values.courtJurisdictions}
            onChange={(v) => set("courtJurisdictions", v)}
            placeholder="e.g. Bombay High Court, NCLT Mumbai"
          />
        </div>

        <div className="space-y-2">
          <Label>Engagement mode</Label>
          <RadioGroup
            value={values.preferredEngagementMode ?? ""}
            onValueChange={(v) => set("preferredEngagementMode", v as PreferredEngagementMode)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="in_person" id="eng-in-person" />
              <Label htmlFor="eng-in-person" className="font-normal cursor-pointer">In-person</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="remote" id="eng-remote" />
              <Label htmlFor="eng-remote" className="font-normal cursor-pointer">Remote</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="eng-both" />
              <Label htmlFor="eng-both" className="font-normal cursor-pointer">Both</Label>
            </div>
          </RadioGroup>
        </div>

        <p className="text-xs text-muted-foreground">
          Professional certificates (Bar, ICAI, GST) are uploaded on your Profile after you finish registration.
        </p>
      </div>
    </div>
  );
}
