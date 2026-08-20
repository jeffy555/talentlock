export function buildProfessionContext(job: { professionCategory: string }): string {
  if (job.professionCategory === "education") {
    return "This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills.\n\n";
  }
  if (job.professionCategory === "healthcare") {
    return "This is a healthcare hiring request. Evaluate clinical specialties, care settings, registration council status, years of experience, and Aadhaar/credential verification as primary match criteria instead of technical skills or teaching subjects.\n\n";
  }
  return "";
}
