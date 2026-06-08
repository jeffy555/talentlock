export const AI_MATCH_JOB_SESSION_KEY = "tl_ai_match_job_id";

export function parseJobIdFromSearch(search: string): number | undefined {
  const raw =
    new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("jobId") ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("jobId")
      : null);
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

export function readPersistedJobId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = sessionStorage.getItem(AI_MATCH_JOB_SESSION_KEY);
  if (!raw) return undefined;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : undefined;
}

export function persistJobId(jobId: number) {
  sessionStorage.setItem(AI_MATCH_JOB_SESSION_KEY, String(jobId));
}

export function resolveActiveJobId(
  conversationJobId?: number | null,
  urlJobId?: number,
  fallbackJobId?: number,
): number | undefined {
  const id = conversationJobId ?? urlJobId ?? readPersistedJobId() ?? fallbackJobId;
  return id != null && Number.isFinite(id) ? id : undefined;
}

export function freelancerProfileHref(
  freelancerId: number,
  jobRequirementId?: number | null,
): string {
  const base = `/freelancers/${freelancerId}`;
  return jobRequirementId != null ? `${base}?jobId=${jobRequirementId}` : base;
}

/** Job context for employer profile views: URL param, then session (from job/ai-match pages). */
export function resolveFreelancerDetailJobId(search: string): string | null {
  const fromUrl = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("jobId");
  if (fromUrl) return fromUrl;
  const stored = readPersistedJobId();
  return stored != null ? String(stored) : null;
}
