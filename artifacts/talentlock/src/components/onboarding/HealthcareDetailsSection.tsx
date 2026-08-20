import ChipInput from "@/components/ChipInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Stethoscope } from "lucide-react";
import type {
  HealthcareProfessionType,
  HealthcareQualification,
  PreferredCareMode,
} from "@workspace/api-client-react";
import { HEALTHCARE_QUALIFICATION_LABELS } from "@/lib/healthcareDisplayUtils";

export interface HealthcareDetailsValues {
  clinicalSpecialties: string[];
  clinicalSettings: string[];
  yearsClinicalExperience: number | null;
  highestQualification: HealthcareQualification | null;
  qualificationSpecialization: string;
  qualificationInstitution: string;
  registrationCouncil: string;
  registrationNumber: string;
  registrationExpiry: string;
  preferredCareMode: PreferredCareMode | null;
}

export function emptyHealthcareDetails(): HealthcareDetailsValues {
  return {
    clinicalSpecialties: [],
    clinicalSettings: [],
    yearsClinicalExperience: null,
    highestQualification: null,
    qualificationSpecialization: "",
    qualificationInstitution: "",
    registrationCouncil: "",
    registrationNumber: "",
    registrationExpiry: "",
    preferredCareMode: null,
  };
}

interface HealthcareDetailsSectionProps {
  healthcareProfessionType: HealthcareProfessionType | null;
  values: HealthcareDetailsValues;
  onChange: (values: HealthcareDetailsValues) => void;
}

const CLINICAL_SETTING_HINTS = ["Hospital", "Clinic", "ICU", "Telehealth", "Home care"];

export default function HealthcareDetailsSection({
  healthcareProfessionType,
  values,
  onChange,
}: HealthcareDetailsSectionProps) {
  const set = <K extends keyof HealthcareDetailsValues>(key: K, val: HealthcareDetailsValues[K]) => {
    onChange({ ...values, [key]: val });
  };

  return (
    <div className="rounded-lg border border-emerald-200 overflow-hidden">
      <div className="bg-emerald-50 px-5 py-3 border-b border-emerald-200">
        <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <Stethoscope className="h-4 w-4" />
          Healthcare Details
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <Label>Clinical specialties</Label>
          <ChipInput
            value={values.clinicalSpecialties}
            onChange={(v) => set("clinicalSpecialties", v)}
            placeholder="e.g. Internal Medicine, ICU"
          />
        </div>

        <div className="space-y-2">
          <Label>Care settings</Label>
          <ChipInput
            value={values.clinicalSettings}
            onChange={(v) => set("clinicalSettings", v)}
            placeholder={`e.g. ${CLINICAL_SETTING_HINTS.slice(0, 2).join(", ")}`}
          />
        </div>

        <div className="space-y-2">
          <Label>Years of clinical experience</Label>
          <Input
            type="number"
            min={0}
            value={values.yearsClinicalExperience ?? ""}
            onChange={(e) =>
              set(
                "yearsClinicalExperience",
                e.target.value ? parseInt(e.target.value, 10) : null,
              )
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Highest qualification</Label>
          <Select
            value={values.highestQualification ?? ""}
            onValueChange={(v) =>
              set("highestQualification", (v as HealthcareQualification) || null)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select qualification" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(HEALTHCARE_QUALIFICATION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Specialization</Label>
            <Input
              value={values.qualificationSpecialization}
              onChange={(e) => set("qualificationSpecialization", e.target.value)}
              placeholder="e.g. Cardiology"
            />
          </div>
          <div className="space-y-2">
            <Label>Institution</Label>
            <Input
              value={values.qualificationInstitution}
              onChange={(e) => set("qualificationInstitution", e.target.value)}
              placeholder="e.g. AIIMS Delhi"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Registration council</Label>
          <Input
            value={values.registrationCouncil}
            onChange={(e) => set("registrationCouncil", e.target.value)}
            placeholder="e.g. Maharashtra Medical Council"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Registration number</Label>
            <Input
              value={values.registrationNumber}
              onChange={(e) => set("registrationNumber", e.target.value)}
              placeholder="Council registration ID"
            />
          </div>
          <div className="space-y-2">
            <Label>Registration expiry (if applicable)</Label>
            <Input
              type="date"
              value={values.registrationExpiry}
              onChange={(e) => set("registrationExpiry", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Preferred care mode</Label>
          <RadioGroup
            value={values.preferredCareMode ?? ""}
            onValueChange={(v) => set("preferredCareMode", v as PreferredCareMode)}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="in_person" id="care-in-person" />
              <Label htmlFor="care-in-person" className="font-normal cursor-pointer">In-person</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="telehealth" id="care-telehealth" />
              <Label htmlFor="care-telehealth" className="font-normal cursor-pointer">Telehealth</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="care-both" />
              <Label htmlFor="care-both" className="font-normal cursor-pointer">Both</Label>
            </div>
          </RadioGroup>
        </div>

        {healthcareProfessionType === "physician" && (
          <p className="text-xs text-muted-foreground">
            Phase 2: upload MBBS degree, medical council registration, and experience letter from Profile.
          </p>
        )}
      </div>
    </div>
  );
}
