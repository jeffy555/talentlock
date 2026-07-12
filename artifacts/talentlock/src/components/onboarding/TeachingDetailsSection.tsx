import ChipInput from "@/components/ChipInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GraduationCap } from "lucide-react";
import type {
  EducationProfessionType,
  HighestDegree,
  PreferredTeachingMode,
} from "@workspace/api-client-react";

export const EDUCATION_TYPE_LABELS: Record<EducationProfessionType, string> = {
  school_teacher: "School Teacher",
  university_lecturer: "University Lecturer",
  tutor: "Private Tutor",
  researcher: "Researcher",
};

export interface TeachingDetailsValues {
  teachingSubjects: string[];
  teachingLevels: string[];
  yearsTeachingExperience: number | null;
  highestDegree: HighestDegree | null;
  degreeSubject: string;
  degreeInstitution: string;
  teachingLicenceState: string;
  teachingLicenceExpiry: string;
  researchPublications: string;
  preferredTeachingMode: PreferredTeachingMode | null;
  location: string;
}

interface TeachingDetailsSectionProps {
  educationProfessionType: EducationProfessionType | null;
  values: TeachingDetailsValues;
  onChange: (values: TeachingDetailsValues) => void;
}

export default function TeachingDetailsSection({
  educationProfessionType,
  values,
  onChange,
}: TeachingDetailsSectionProps) {
  const set = <K extends keyof TeachingDetailsValues>(key: K, val: TeachingDetailsValues[K]) => {
    onChange({ ...values, [key]: val });
  };

  return (
    <div className="rounded-lg border border-primary/20 overflow-hidden">
      <div className="bg-primary/5 px-5 py-3 border-b border-primary/20">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <GraduationCap className="h-4 w-4" />
          Teaching Details
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <Label>Subjects you teach</Label>
          <ChipInput
            value={values.teachingSubjects}
            onChange={(v) => set("teachingSubjects", v)}
            placeholder="e.g. GCSE Mathematics"
          />
        </div>

        <div className="space-y-2">
          <Label>Levels you teach</Label>
          <ChipInput
            value={values.teachingLevels}
            onChange={(v) => set("teachingLevels", v)}
            placeholder="e.g. Secondary, Sixth Form"
          />
        </div>

        <div className="space-y-2">
          <Label>Years of teaching experience</Label>
          <Input
            type="number"
            min={0}
            value={values.yearsTeachingExperience ?? ""}
            onChange={(e) =>
              set("yearsTeachingExperience", e.target.value ? Number(e.target.value) : null)
            }
            className="w-24"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Highest degree</Label>
            <Select
              value={values.highestDegree ?? ""}
              onValueChange={(v) => set("highestDegree", (v || null) as HighestDegree | null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select degree" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bachelors">Bachelor&apos;s</SelectItem>
                <SelectItem value="masters">Master&apos;s</SelectItem>
                <SelectItem value="phd">PhD</SelectItem>
                <SelectItem value="postdoc">Postdoc</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={values.degreeSubject}
              onChange={(e) => set("degreeSubject", e.target.value)}
              placeholder="e.g. Mathematics"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Institution</Label>
          <Input
            value={values.degreeInstitution}
            onChange={(e) => set("degreeInstitution", e.target.value)}
            placeholder="e.g. University of Manchester"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Teaching licence - State/Region (optional)</Label>
            <Input
              value={values.teachingLicenceState}
              onChange={(e) => set("teachingLicenceState", e.target.value)}
              placeholder="e.g. England"
            />
          </div>
          <div className="space-y-2">
            <Label>Licence expiry (optional)</Label>
            <Input
              type="date"
              value={values.teachingLicenceExpiry}
              onChange={(e) => set("teachingLicenceExpiry", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Preferred teaching mode</Label>
          <RadioGroup
            value={values.preferredTeachingMode ?? ""}
            onValueChange={(v) => set("preferredTeachingMode", (v || null) as PreferredTeachingMode | null)}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="in_person" id="mode-in-person" />
              <Label htmlFor="mode-in-person" className="font-normal cursor-pointer">In person</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="online" id="mode-online" />
              <Label htmlFor="mode-online" className="font-normal cursor-pointer">Online</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="mode-both" />
              <Label htmlFor="mode-both" className="font-normal cursor-pointer">Both</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <Input
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Manchester, UK"
          />
        </div>

        {educationProfessionType === "researcher" && (
          <div className="space-y-2">
            <Label>ORCID / Google Scholar profile (optional)</Label>
            <Input
              value={values.researchPublications}
              onChange={(e) => set("researchPublications", e.target.value)}
              placeholder="https://orcid.org/..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const emptyTeachingDetails = (): TeachingDetailsValues => ({
  teachingSubjects: [],
  teachingLevels: [],
  yearsTeachingExperience: null,
  highestDegree: null,
  degreeSubject: "",
  degreeInstitution: "",
  teachingLicenceState: "",
  teachingLicenceExpiry: "",
  researchPublications: "",
  preferredTeachingMode: null,
  location: "",
});
