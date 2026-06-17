export function buildProfessionContext(job: { professionCategory: string }): string {
  if (job.professionCategory !== "education") return "";
  return "This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills.\n\n";
}
