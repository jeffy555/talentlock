const BASE = import.meta.env.BASE_URL ?? "/";

function apiUrl(path: string): string {
  const normalizedBase = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export class AgreementDownloadError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AgreementDownloadError";
  }
}

export async function downloadAgreementPdf(
  agreementId: string | number,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  const response = await fetch(apiUrl(`/api/agreements/${agreementId}/download`), {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      if (body.code === "NOT_FULLY_SIGNED") {
        throw new AgreementDownloadError(
          "Agreement must be fully signed before downloading.",
          body.code,
        );
      }
    }
    throw new AgreementDownloadError(`Download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `TalentLock-Agreement-${agreementId}-Signed.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
