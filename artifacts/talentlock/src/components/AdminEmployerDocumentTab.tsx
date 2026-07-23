import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { adminMutate } from "@/lib/adminCsrf";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function proxiedStorageUrl(absoluteUrl: string): string {
  try {
    const parsed = new URL(absoluteUrl, window.location.origin);
    const apiPathIndex = parsed.pathname.indexOf("/api/storage/");
    if (apiPathIndex >= 0) {
      return `${basePath}${parsed.pathname.slice(apiPathIndex)}${parsed.search}`;
    }
  } catch {
    // fall through
  }
  return absoluteUrl;
}

async function fetchEmployerDocumentViewUrl(documentId: number): Promise<string> {
  const response = await fetch(`${basePath}/api/admin/employer-documents/${documentId}/view-url`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load document");
  const body = (await response.json()) as { signedUrl: string };
  return proxiedStorageUrl(body.signedUrl);
}
const labels: Record<string, string> = {
  company_registration: "Company Registration Certificate",
  tax_vat_certificate: "Tax / VAT Certificate",
  business_licence: "Business Licence",
  representative_id: "Representative ID",
  proof_of_business_address: "Proof of Business Address",
};

type Section = "pending" | "verified" | "rejected";

type Row = {
  id: number;
  employerName: string | null;
  companyName: string;
  documentType: string;
  status: string;
  confidence: number | null;
  aiNotes: string | null;
  adminNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const SECTION_STATUS: Record<Section, string> = {
  pending: "pending,needs_review",
  verified: "verified",
  rejected: "rejected",
};

const SECTION_EMPTY: Record<Section, string> = {
  pending: "No documents pending review.",
  verified: "No approved employer documents yet.",
  rejected: "No rejected employer documents yet.",
};

function StatusBadge({ status }: { status: string }) {
  const config =
    status === "verified"
      ? { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : status === "rejected"
        ? { label: "Rejected", className: "border-red-200 bg-red-50 text-red-700" }
        : status === "needs_review"
          ? { label: "Needs review", className: "border-amber-200 bg-amber-50 text-amber-700" }
          : { label: "Pending", className: "border-slate-200 bg-slate-100 text-slate-600" };

  return (
    <span className={cn("inline-flex rounded border px-2 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}

export function AdminEmployerDocumentTab({ onCount }: { onCount?: (count: number) => void }) {
  const { toast } = useToast();
  const [section, setSection] = useState<Section>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<Section, number>>({ pending: 0, verified: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const loadSection = useCallback(async (target: Section) => {
    const response = await fetch(
      `${basePath}/api/admin/employer-documents?page=1&pageSize=50&status=${SECTION_STATUS[target]}`,
      { credentials: "include", cache: "no-store" },
    );
    if (!response.ok) throw new Error("Unable to load employer documents");
    const result = await response.json() as { data: Row[]; total: number };
    return result;
  }, []);

  const load = useCallback(async (target: Section = section) => {
    setLoading(true);
    try {
      const result = await loadSection(target);
      setRows(result.data);
      setTotals((current) => ({ ...current, [target]: result.total }));
      if (target === "pending") onCount?.(result.total);
    } catch {
      toast({ title: "Failed to load employer documents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [loadSection, onCount, section, toast]);

  const loadCounts = useCallback(async () => {
    try {
      const [pending, verified, rejected] = await Promise.all([
        loadSection("pending"),
        loadSection("verified"),
        loadSection("rejected"),
      ]);
      setTotals({
        pending: pending.total,
        verified: verified.total,
        rejected: rejected.total,
      });
      onCount?.(pending.total);
    } catch {
      // Counts are best-effort; active section load shows errors.
    }
  }, [loadSection, onCount]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    void load(section);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  async function review(row: Row, verdict: "verify" | "reject") {
    const adminNotes = notes[row.id]?.trim() ?? "";
    if (verdict === "reject" && !adminNotes) {
      toast({ title: "Admin notes required for rejection", variant: "destructive" });
      return;
    }
    const response = await adminMutate(`${basePath}/api/admin/employer-documents/${row.id}/${verdict}`, {
      method: "POST",
      body: JSON.stringify({ adminNotes }),
    });
    if (!response.ok) {
      toast({ title: "Review failed", description: "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: verdict === "verify" ? "Employer document approved" : "Employer document rejected" });
    await load("pending");
    await loadCounts();
    if (section !== "pending") await load(section);
  }

  async function openDocument(row: Row) {
    setOpeningId(row.id);
    try {
      const url = await fetchEmployerDocumentViewUrl(row.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Could not open document", description: "Try again or re-run AI review.", variant: "destructive" });
    } finally {
      setOpeningId(null);
    }
  }

  async function rerunAiReview(row: Row) {
    setReviewingId(row.id);
    try {
      const response = await adminMutate(`${basePath}/api/admin/employer-documents/${row.id}/review`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Review request failed");
      toast({ title: "AI review started", description: "Refresh in a few seconds to see updated assessment." });
      setTimeout(() => {
        void load("pending");
      }, 4000);
    } catch {
      toast({ title: "Could not start AI review", variant: "destructive" });
    } finally {
      setReviewingId(null);
    }
  }

  function renderRow(row: Row) {
    const isPendingSection = section === "pending";

    return (
      <Card key={row.id}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{row.companyName}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {row.employerName ?? "Employer"} · {labels[row.documentType] ?? row.documentType}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploaded {new Date(row.createdAt).toLocaleString()}
                {row.reviewedAt && (
                  <> · Reviewed {new Date(row.reviewedAt).toLocaleString()}</>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm">
              <p>Confidence: {row.confidence == null ? "—" : `${row.confidence}%`}</p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                disabled={openingId === row.id}
                onClick={() => void openDocument(row)}
              >
                {openingId === row.id ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Opening…
                  </>
                ) : (
                  "View document ↗"
                )}
              </Button>
            </div>
          </div>

          {row.aiNotes && (
            <div className="rounded border bg-muted/30 p-3 text-xs">
              <p className="font-semibold">AI Assessment</p>
              <p className="mt-1">{row.aiNotes}</p>
            </div>
          )}

          {!isPendingSection && row.adminNotes && (
            <div className={cn(
              "rounded border p-3 text-xs",
              section === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}>
              <p className="font-semibold">Admin notes</p>
              <p className="mt-1">{row.adminNotes}</p>
            </div>
          )}

          {isPendingSection && (
            <>
              <Textarea
                rows={2}
                placeholder="Admin notes (required for rejection)"
                value={notes[row.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void review(row, "verify")}>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                </Button>
                <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => void review(row, "reject")}>
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reviewingId === row.id}
                  onClick={() => void rerunAiReview(row)}
                >
                  {reviewingId === row.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Re-run AI review
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={section} onValueChange={(value) => setSection(value as Section)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="pending" className="gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Pending
          {totals.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              {totals.pending}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="verified" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approved
          {totals.verified > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
              {totals.verified}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="rejected" className="gap-1.5">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
          {totals.rejected > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
              {totals.rejected}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      {(["pending", "verified", "rejected"] as Section[]).map((tab) => (
        <TabsContent key={tab} value={tab} className="mt-0">
          {loading && section === tab ? (
            <p className="py-8 text-sm text-muted-foreground">Loading employer documents…</p>
          ) : section === tab && rows.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">{SECTION_EMPTY[tab]}</p>
          ) : section === tab ? (
            <div className="space-y-3">{rows.map(renderRow)}</div>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
