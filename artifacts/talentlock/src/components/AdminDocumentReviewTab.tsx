import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

import { adminMutate } from "@/lib/adminCsrf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 20;

type DocumentReviewRow = {
  id: number;
  freelancerId: number;
  documentType: string;
  aiNotes: string | null;
  confidence: number | null;
  updatedAt: string;
  freelancerName: string;
  freelancerEmail: string;
  isPdf: boolean;
};

type DocumentReviewResponse = {
  data: DocumentReviewRow[];
  total: number;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  government_id: "Government ID",
  professional_credential: "Professional Credential",
  portfolio_proof: "Portfolio Proof",
};

function docTypeLabel(type: string): string {
  return DOC_TYPE_LABELS[type] ?? type;
}

function confidenceDisplay(confidence: number | null): { text: string; className: string } {
  if (confidence === null) {
    return { text: "—", className: "text-muted-foreground" };
  }
  if (confidence >= 70) {
    return { text: `${confidence}%`, className: "text-emerald-700 font-medium" };
  }
  if (confidence >= 40) {
    return { text: `${confidence}%`, className: "text-amber-700 font-medium" };
  }
  return { text: `${confidence}%`, className: "text-red-700 font-medium" };
}

class DocumentReviewFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DocumentReviewFetchError";
  }
}

async function fetchDocumentQueue(page: number): Promise<DocumentReviewResponse> {
  const res = await fetch(`${basePath}/api/admin/documents?page=${page}`, {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DocumentReviewFetchError(
      body || `Request failed (${res.status})`,
      res.status,
    );
  }
  return res.json();
}

async function fetchSignedUrl(documentId: number): Promise<{ signedUrl: string; isPdf: boolean }> {
  const res = await fetch(`${basePath}/api/admin/documents/${documentId}/signed-url`, {
    credentials: "include",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("Failed to load document");
  const body = (await res.json()) as { signedUrl: string; isPdf?: boolean };
  return { signedUrl: body.signedUrl, isPdf: body.isPdf ?? false };
}

async function patchDocumentVerdict(
  documentId: number,
  verdict: "verified" | "rejected",
  adminNotes: string,
): Promise<void> {
  const res = await adminMutate(`${basePath}/api/admin/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      verdict,
      adminNotes: adminNotes.trim() || undefined,
    }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

export function AdminDocumentReviewTabIcon() {
  return <ShieldCheck className="h-4 w-4" />;
}

export default function AdminDocumentReviewTab({
  onUnauthorized,
  onPendingCountChange,
}: {
  onUnauthorized: () => void;
  onPendingCountChange?: (total: number) => void;
}) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DocumentReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DocumentReviewRow | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [submitting, setSubmitting] = useState<"verified" | "rejected" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDocumentQueue(page);
      setRows(result.data);
      setTotal(result.total);
      onPendingCountChange?.(result.total);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      if (err instanceof DocumentReviewFetchError && err.status === 404) {
        setError("Document review API not found — restart the API server to pick up the latest routes.");
        return;
      }
      setError(
        err instanceof Error ? err.message : "Failed to load document review queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, onUnauthorized, onPendingCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setSignedUrl(null);
      setPreviewIsPdf(false);
      setImageError(false);
      setAdminNotes("");
      return;
    }

    let cancelled = false;
    setImageLoading(true);
    setImageError(false);
    setSignedUrl(null);
    setPreviewIsPdf(false);
    setAdminNotes("");

    void fetchSignedUrl(selected.id)
      .then(({ signedUrl: url, isPdf }) => {
        if (!cancelled) {
          setSignedUrl(url);
          setPreviewIsPdf(isPdf || selected.isPdf);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setImageError(true);
          if (err instanceof Error && err.message === "UNAUTHORIZED") {
            onUnauthorized();
          }
        }
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, onUnauthorized]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  async function handleVerdict(verdict: "verified" | "rejected") {
    if (!selected) return;
    setSubmitting(verdict);
    try {
      await patchDocumentVerdict(selected.id, verdict, adminNotes);
      toast({
        title: verdict === "verified" ? "Document marked as verified." : "Document rejected — freelancer notified.",
      });
      setSelected(null);
      await load();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        onUnauthorized();
        return;
      }
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Document Review Queue · {total} pending
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={loading || isFirstPage} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </Button>
            <Button variant="outline" size="sm" disabled={loading || isLastPage} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                    <th className="py-2 pr-4">Freelancer</th>
                    <th className="py-2 pr-4">Doc Type</th>
                    <th className="py-2 pr-4">Submitted</th>
                    <th className="py-2 pr-4">Confidence</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="py-2 pr-4">
                          <Skeleton className="h-4 w-full max-w-[120px]" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : total === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
              <p>No documents pending review.</p>
              <p className="text-sm">All submitted documents have been processed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                    <th className="py-2 pr-4">Freelancer</th>
                    <th className="py-2 pr-4">Doc Type</th>
                    <th className="py-2 pr-4">Submitted</th>
                    <th className="py-2 pr-4">Confidence</th>
                    <th className="py-2 pr-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const conf = confidenceDisplay(row.confidence);
                    return (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{row.freelancerName}</div>
                          <div className="text-xs text-muted-foreground">{row.freelancerEmail}</div>
                        </td>
                        <td className="py-2 pr-4">{docTypeLabel(row.documentType)}</td>
                        <td
                          className="py-2 pr-4 whitespace-nowrap"
                          title={format(new Date(row.updatedAt), "PPpp")}
                        >
                          {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                        </td>
                        <td className={`py-2 pr-4 ${conf.className}`}>{conf.text}</td>
                        <td className="py-2 pr-4">
                          <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
                            Review
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Review Document</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <p className="font-medium">
                    {selected.freelancerName} · {docTypeLabel(selected.documentType)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Submitted {format(new Date(selected.updatedAt), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/20">
                  {imageLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : imageError || !signedUrl ? (
                    <p className="text-sm text-red-600 py-8 text-center">Could not load document.</p>
                  ) : previewIsPdf ? (
                    <>
                      <iframe
                        src={signedUrl}
                        title={`${docTypeLabel(selected.documentType)} PDF for ${selected.freelancerName}`}
                        className="h-[300px] w-full rounded-md border bg-white"
                      />
                      <p className="text-xs text-muted-foreground mt-2">PDF preview · expires in 15min</p>
                    </>
                  ) : (
                    <>
                      <img
                        src={signedUrl}
                        alt={`${docTypeLabel(selected.documentType)} for ${selected.freelancerName}`}
                        className="max-h-[300px] w-full object-contain rounded-md border bg-white"
                      />
                      <p className="text-xs text-muted-foreground mt-2">Expires in 15min</p>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">AI Assessment</h3>
                  <p className="text-sm">
                    Confidence:{" "}
                    <span className={confidenceDisplay(selected.confidence).className}>
                      {confidenceDisplay(selected.confidence).text}
                    </span>
                  </p>
                  <div className="bg-slate-50 rounded p-3 text-sm text-foreground">
                    {selected.aiNotes ?? "No AI notes provided."}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-notes">Note to freelancer (optional)</Label>
                  <Textarea
                    id="admin-notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value.slice(0, 300))}
                    rows={4}
                    placeholder="Explain your decision to the freelancer…"
                  />
                  <p className="text-xs text-muted-foreground text-right">{adminNotes.length}/300</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    variant="destructive"
                    disabled={submitting !== null}
                    onClick={() => void handleVerdict("rejected")}
                  >
                    {submitting === "rejected" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    ✗ Reject
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={submitting !== null}
                    onClick={() => void handleVerdict("verified")}
                  >
                    {submitting === "verified" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    ✓ Verify
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
