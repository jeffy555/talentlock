import { describe, expect, it } from "vitest";

import { isDocumentType } from "../../src/lib/documentConstants";

describe("documentConstants", () => {
  it("accepts healthcare Phase 2+ document types", () => {
    expect(isDocumentType("mbbs_degree")).toBe(true);
    expect(isDocumentType("medical_registration_certificate")).toBe(true);
    expect(isDocumentType("nursing_degree")).toBe(true);
    expect(isDocumentType("nursing_registration_certificate")).toBe(true);
    expect(isDocumentType("allied_qualification")).toBe(true);
    expect(isDocumentType("experience_certificate")).toBe(true);
  });

  it("accepts legal-finance Phase 5 document types", () => {
    expect(isDocumentType("bar_enrolment_certificate")).toBe(true);
    expect(isDocumentType("certificate_of_practice")).toBe(true);
    expect(isDocumentType("icai_membership_certificate")).toBe(true);
    expect(isDocumentType("icsi_membership_certificate")).toBe(true);
    expect(isDocumentType("gst_practitioner_certificate")).toBe(true);
    expect(isDocumentType("sebi_nism_certificate")).toBe(true);
  });

  it("still accepts legacy document types", () => {
    expect(isDocumentType("aadhaar")).toBe(true);
    expect(isDocumentType("government_id")).toBe(true);
    expect(isDocumentType("professional_credential")).toBe(true);
  });

  it("rejects unknown document types", () => {
    expect(isDocumentType("aibe_certificate")).toBe(false);
    expect(isDocumentType("specialist_qualification")).toBe(false);
    expect(isDocumentType("unknown_type")).toBe(false);
  });
});
