import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { adminMutate } from "@/lib/adminCsrf";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const labels: Record<string, string> = {
  company_registration: "Company Registration Certificate",
  tax_vat_certificate: "Tax / VAT Certificate",
  business_licence: "Business Licence",
  representative_id: "Representative ID",
  proof_of_business_address: "Proof of Business Address",
};

type Row = {
  id: number;
  employerName: string | null;
  companyName: string;
  documentType: string;
  status: string;
  confidence: number | null;
  aiNotes: string | null;
  signedFileUrl: string;
  createdAt: string;
};

export function AdminEmployerDocumentTab({ onCount }: { onCount?: (count: number) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${basePath}/api/admin/employer-documents?page=1&pageSize=50`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load employer documents");
      const result = await response.json() as { data: Row[]; total: number };
      setRows(result.data);
      onCount?.(result.total);
    } catch {
      toast({ title: "Failed to load employer documents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [onCount, toast]);

  useEffect(() => { void load(); }, [load]);

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
    toast({ title: verdict === "verify" ? "Employer document verified" : "Employer document rejected" });
    await load();
  }

  if (loading) return <p className="py-8 text-sm text-muted-foreground">Loading employer documents…</p>;
  if (rows.length === 0) return <p className="py-8 text-sm text-muted-foreground">No documents pending review.</p>;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{row.companyName}</p>
                <p className="text-sm text-muted-foreground">{row.employerName ?? "Employer"} · {labels[row.documentType] ?? row.documentType}</p>
                <p className="mt-1 text-xs text-muted-foreground">Uploaded {new Date(row.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-right text-sm">
                <p>Confidence: {row.confidence == null ? "—" : `${row.confidence}%`}</p>
                <a href={row.signedFileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View document ↗</a>
              </div>
            </div>
            {row.aiNotes && <div className="rounded border bg-muted/30 p-3 text-xs"><p className="font-semibold">AI Assessment</p><p className="mt-1">{row.aiNotes}</p></div>}
            <Textarea
              rows={2}
              placeholder="Admin notes (required for rejection)"
              value={notes[row.id] ?? ""}
              onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void review(row, "verify")}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Verify
              </Button>
              <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => void review(row, "reject")}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" />Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
