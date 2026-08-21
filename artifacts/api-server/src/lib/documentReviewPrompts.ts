import type { DocumentType } from "./documentConstants";

export function buildDocumentReviewUserPrompt(documentType: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    aadhaar: "Aadhaar Card (required Indian government photo ID)",
    government_id: "Government ID (Aadhaar, passport, driving licence, or national ID)",
    professional_credential: "Professional Credential (degree, licence, or certification)",
    experience_certificate:
      "Experience certificate (employer/hospital/firm letter on letterhead with role, department, and employment dates)",
    mbbs_degree: "MBBS / medical degree certificate (institution name should be visible)",
    medical_registration_certificate:
      "Medical council registration certificate (SMC / NMR — registration number region present; not Aadhaar)",
    nursing_degree: "Nursing degree or diploma certificate (B.Sc, GNM, ANM, post-basic; institution present)",
    nursing_registration_certificate:
      "Nursing council registration certificate (SNRC — RN/RM number region present)",
    allied_qualification:
      "Allied health qualification (physio, radiology, lab, OT, pharmacy degree or diploma)",
    bar_enrolment_certificate:
      "Bar Council enrolment certificate / sanad (enrolment number region present; not Aadhaar)",
    certificate_of_practice:
      "Certificate of Practice (BCI / ICAI / ICSI — holder name region present; not a visiting card)",
    icai_membership_certificate: "ICAI membership certificate (Chartered Accountant)",
    icsi_membership_certificate: "ICSI membership certificate (Company Secretary)",
    gst_practitioner_certificate:
      "GST Practitioner enrolment certificate or GSTN screenshot (GSTIN region may appear — do not extract GSTIN)",
    sebi_nism_certificate: "SEBI RIA acknowledgement or NISM pass certificate (financial adviser)",
  };

  const typeSpecific: Partial<Record<DocumentType, string>> = {
    experience_certificate:
      "Verify letterhead, role/designation, department, and employment dates. Reject blank pages and unrelated ID cards.",
    mbbs_degree:
      "Verify this appears to be an MBBS or medical degree certificate with institution name. Reject screenshots of news articles.",
    medical_registration_certificate:
      "Verify SMC/NMR/medical council registration certificate. Do not treat Aadhaar as a match. Never return full registration numbers in employer-facing notes.",
    nursing_degree:
      "Verify nursing degree/diploma certificate with institution name visible.",
    nursing_registration_certificate:
      "Verify SNRC/nursing council registration certificate with RN/RM number region visible.",
    allied_qualification:
      "Verify allied health degree/diploma with institution name visible.",
    bar_enrolment_certificate:
      "Verify State Bar Council enrolment/sanad. Never return full enrolment numbers in employer-facing notes.",
    certificate_of_practice:
      "Verify Certificate of Practice issued by BCI/ICAI/ICSI. Reject business visiting cards.",
    icai_membership_certificate: "Verify ICAI membership certificate for a Chartered Accountant.",
    icsi_membership_certificate: "Verify ICSI membership certificate for a Company Secretary.",
    gst_practitioner_certificate:
      "Verify GST Practitioner enrolment document from GSTN.",
    sebi_nism_certificate: "Verify SEBI RIA acknowledgement or NISM examination pass certificate.",
  };

  const specific = typeSpecific[documentType];
  const base = `Submitted document type: ${documentType} — ${labels[documentType]}

Assess the attached image against that declared type. Aadhaar is explicitly accepted for "aadhaar" and "government_id" only.`;

  return specific ? `${base}\n\nFocus: ${specific}` : base;
}
