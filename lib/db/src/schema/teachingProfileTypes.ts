// Teaching Professional Profile — shared types and document lookup (Phase 1 inspection)
// Q1: skills column is text().array() — teachingSubjects/teachingLevels match that type
// Q2: no existing location column on freelancer_profiles — location added as nullable text

export type ProfessionCategory = "technology" | "education";
export type EducationProfessionType =
  | "school_teacher"
  | "university_lecturer"
  | "tutor"
  | "researcher";
export type HighestDegree = "bachelors" | "masters" | "phd" | "postdoc";
export type DbsCheckStatus = "not_uploaded" | "uploaded" | "verified" | "expired";
export type PreferredTeachingMode = "in_person" | "online" | "both";
export type RateType = "hourly" | "per_day" | "per_session" | "per_course";

export const REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE: Record<
  EducationProfessionType,
  { required: string[]; recommended: string[] }
> = {
  school_teacher: {
    required: ["degree_certificate", "teaching_licence", "dbs_check"],
    recommended: ["masters_degree", "subject_endorsement"],
  },
  university_lecturer: {
    required: ["masters_or_phd_degree"],
    recommended: ["transcripts", "teaching_statement"],
  },
  tutor: {
    required: [],
    recommended: ["degree_certificate", "dbs_check"],
  },
  researcher: {
    required: ["phd_degree"],
    recommended: ["orcid_profile", "publication_list"],
  },
};
