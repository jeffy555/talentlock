import type { HealthcareProfessionType } from "@workspace/api-client-react";

export const HEALTHCARE_TYPE_LABELS: Record<HealthcareProfessionType, string> = {
  physician: "Physician / Doctor",
  registered_nurse: "Registered Nurse",
  nurse_practitioner: "Nurse Practitioner",
  allied_health: "Allied Health",
  care_worker: "Care Worker",
};

export const PREFERRED_CARE_MODE_LABELS: Record<string, string> = {
  in_person: "In-person",
  telehealth: "Telehealth",
  both: "In-person & telehealth",
};

export const HEALTHCARE_QUALIFICATION_LABELS: Record<string, string> = {
  mbbs: "MBBS",
  bds: "BDS",
  md_ms: "MD / MS",
  dnb: "DNB",
  diploma_medical: "Diploma (Medical)",
  bsc_nursing: "B.Sc Nursing",
  msc_nursing: "M.Sc Nursing",
  gnm: "GNM",
  anm: "ANM",
  post_basic_bsc: "Post Basic B.Sc",
  bpt: "BPT / Physiotherapy",
  mph: "MPH",
  other: "Other",
};

export function aadhaarStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "verified":
      return "Aadhaar verified";
    case "uploaded":
      return "Aadhaar under review";
    case "rejected":
      return "Aadhaar rejected — re-upload required";
    case "expired":
      return "Aadhaar expired — re-upload required";
    default:
      return "Aadhaar not uploaded";
  }
}
