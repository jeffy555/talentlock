export function buildProfessionContext(job: { professionCategory: string }): string {
  if (job.professionCategory === "education") {
    return "This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills.\n\n";
  }
  if (job.professionCategory === "healthcare") {
    return "This is a healthcare hiring request. Evaluate clinical specialties, care settings, registration council status, years of experience, and Aadhaar/credential verification as primary match criteria instead of technical skills or teaching subjects.\n\n";
  }
  if (job.professionCategory === "legal_finance") {
    return "This is a legal or finance hiring request. Evaluate practice areas, enrolment body and number status, years of practice, court jurisdictions (if advocate), and Aadhaar/credential verification as primary match criteria instead of technical skills, teaching subjects, or clinical specialties.\n\n";
  }
  return "";
}
