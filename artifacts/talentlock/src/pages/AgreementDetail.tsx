import { useParams } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useGetAgreement,
  useSignAgreement,
  useGetMe,
  useGetMySubscription,
  useGetTokenUsageMe,
} from "@workspace/api-client-react";
import ContractRedliningSection from "@/components/ContractRedliningSection";
import ContractHealthScoreCard from "@/components/ContractHealthScoreCard";
import AgreementSummaryPanel from "@/components/AgreementSummaryPanel";
import type { HealthScoreDimensions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock, FileText, PenLine, Shield, Lock, Fingerprint, Download, Upload, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState, useRef } from "react";
import { AgreementDownloadError, downloadAgreementPdf } from "@/lib/downloadUtils";

function LegalDocument({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      elements.push(<div key={key++} className="h-3" />);
      continue;
    }

    // Decorative dividers like ═══
    if (/^[═─]{10,}/.test(trimmed)) {
      elements.push(<hr key={key++} className="border-border/60 my-4" />);
      continue;
    }

    // Top-level section number heading: "1. DEFINITIONS" or "15. GENERAL"
    if (/^\d{1,2}\.\s+[A-Z]/.test(trimmed)) {
      elements.push(
        <h2 key={key++} className="font-serif text-base font-bold text-foreground mt-8 mb-2 pb-1 border-b border-border/40 tracking-tight">
          {trimmed}
        </h2>
      );
      continue;
    }

    // Sub-clause: "1.1", "15.3" etc.
    if (/^\d{1,2}\.\d{1,2}/.test(trimmed)) {
      elements.push(
        <p key={key++} className="text-sm text-foreground leading-relaxed pl-5 mb-2 text-justify">
          {trimmed}
        </p>
      );
      continue;
    }

    // ALL CAPS section label (e.g. "FREELANCE SERVICES AGREEMENT", "EXECUTION", section titles inside preamble)
    if (/^[A-Z][A-Z\s&/,()–-]{8,}$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      elements.push(
        <h1 key={key++} className="font-serif text-xl font-bold text-foreground text-center mt-6 mb-4 tracking-wide uppercase">
          {trimmed}
        </h1>
      );
      continue;
    }

    // Signature field lines: "Name: ___", "Signature: ___", "Date: ___"
    if (/^(Name|Signature|Printed Name|Title|Date|Company|Authorised Signatory)\s*:/.test(trimmed)) {
      elements.push(
        <p key={key++} className="text-sm font-mono text-foreground leading-loose pl-4">
          {trimmed}
        </p>
      );
      continue;
    }

    // "FOR AND ON BEHALF OF" / "IN WITNESS WHEREOF" lines
    if (/^(FOR AND ON BEHALF|IN WITNESS WHEREOF|This agreement was)/.test(trimmed)) {
      elements.push(
        <p key={key++} className="text-sm font-semibold text-foreground mt-4 mb-1">
          {trimmed}
        </p>
      );
      continue;
    }

    // Indented engagement particulars lines (key: value pairs in preamble block)
    if (/^(Client|Service Provider|Core Competencies|Engagement Start|Engagement End|Compensation|Platform)\s*:/.test(trimmed)) {
      const colonIdx = trimmed.indexOf(":");
      const label = trimmed.slice(0, colonIdx);
      const value = trimmed.slice(colonIdx + 1).trim();
      elements.push(
        <div key={key++} className="flex gap-3 text-sm pl-4 mb-1">
          <span className="font-semibold text-foreground min-w-[160px] flex-shrink-0">{label}</span>
          <span className="text-muted-foreground">{value}</span>
        </div>
      );
      continue;
    }

    // Default: normal paragraph
    elements.push(
      <p key={key++} className="text-sm text-foreground leading-relaxed mb-2 text-justify">
        {trimmed}
      </p>
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

const BASE = import.meta.env.BASE_URL ?? "/";

async function requestSigUrl(fileName: string, contentType: string) {
  const res = await fetch(`${BASE}api/storage/uploads/request-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json() as Promise<{ uploadURL: string; objectPath: string }>;
}

export default function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const { data: me } = useGetMe();
  const { data: subscription } = useGetMySubscription({
    query: { enabled: me?.role === "employer" } as any,
  });
  const { data: tokenUsage } = useGetTokenUsageMe({
    query: { enabled: me?.role === "employer" } as any,
  });
  const { data: agreement, isLoading, refetch } = useGetAgreement(parseInt(id!), { query: { enabled: !!id } as any });
  const signAgreement = useSignAgreement();
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [sigMode, setSigMode] = useState<"stored" | "upload" | "text">("stored");
  const [uploadedSigPath, setUploadedSigPath] = useState<string | null>(null);
  const [uploadedSigPreview, setUploadedSigPreview] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [uploadingSig, setUploadingSig] = useState(false);
  const sigFileRef = useRef<HTMLInputElement>(null);

  const storedSigPath = (me as any)?.signatureImageUrl as string | null | undefined;
  const storedSigUrl = storedSigPath ? `${BASE}api/storage${storedSigPath}` : null;

  const ag = agreement as typeof agreement & {
    employerSignatureName?: string | null;
    freelancerSignatureName?: string | null;
    employerSignatureImageUrl?: string | null;
    freelancerSignatureImageUrl?: string | null;
  };

  const handleSigUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please upload an image file", variant: "destructive" }); return;
    }
    setUploadingSig(true);
    try {
      const { uploadURL, objectPath } = await requestSigUrl(file.name, file.type);
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      setUploadedSigPath(objectPath);
      const reader = new FileReader();
      reader.onload = e => setUploadedSigPreview(e.target?.result as string);
      reader.readAsDataURL(file);
      setSigMode("upload");
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingSig(false);
      if (sigFileRef.current) sigFileRef.current.value = "";
    }
  };

  const isEmployer = me?.role === "employer";
  const isFreelancer = me?.role === "freelancer";
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadAgreementPdf(id!, getToken);
    } catch (err) {
      const message =
        err instanceof AgreementDownloadError
          ? err.message
          : "Download failed. Please try again.";
      toast({ title: message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const employerSigned = !!ag?.employerSignedAt;
  const freelancerSigned = !!ag?.freelancerSignedAt;
  const fullyExecuted = employerSigned && freelancerSigned;

  // Determine if the current user can sign
  const myTurn = isEmployer
    ? !employerSigned
    : isFreelancer
    ? employerSigned && !freelancerSigned   // freelancer can only sign after employer
    : false;

  const canSign = (sigMode === "stored" && !!storedSigPath) ||
    (sigMode === "upload" && !!uploadedSigPath) ||
    (sigMode === "text" && !!typedName.trim());

  const handleSign = async () => {
    if (!me?.role || me.role === "pending" || !canSign) return;
    let finalSigImageUrl: string | undefined;
    let finalSigName: string | undefined;
    if (sigMode === "stored" && storedSigPath) {
      finalSigImageUrl = storedSigPath;
      finalSigName = me.name;
    } else if (sigMode === "upload" && uploadedSigPath) {
      finalSigImageUrl = uploadedSigPath;
      finalSigName = me.name;
    } else if (sigMode === "text" && typedName.trim()) {
      finalSigName = typedName.trim();
    }
    try {
      await signAgreement.mutateAsync({
        id: parseInt(id!),
        data: { role: me.role as "freelancer" | "employer", signatureName: finalSigName, signatureImageUrl: finalSigImageUrl } as any,
      });
      toast({
        title: "Contract Executed",
        description: fullyExecuted
          ? "Both parties have signed. The engagement is now legally active."
          : "Your signature has been recorded. The other party has been notified.",
      });
      setSignDialogOpen(false);
      setUploadedSigPath(null);
      setUploadedSigPreview(null);
      setTypedName("");
      setSigMode("stored");
      refetch();
    } catch (err: any) {
      toast({
        title: "Signing failed",
        description: err?.response?.data?.error ?? err?.message ?? "Could not sign the agreement.",
        variant: "destructive",
      });
    }
  };

  if (isLoading && !agreement) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="h-8 w-32 bg-muted rounded animate-pulse"></div>
        <div className="h-16 w-3/4 bg-muted rounded animate-pulse"></div>
        <div className="h-32 w-full bg-muted rounded animate-pulse"></div>
        <div className="h-96 w-full bg-muted rounded animate-pulse"></div>
      </div>
    );
  }
  
  if (!ag) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-dashed border-border">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2 text-foreground">Agreement Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-sm font-light">The contract you are looking for does not exist or you lack permission to view it.</p>
        <Button asChild className="font-semibold shadow-sm">
          <Link href="/agreements">Back to Agreements</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/agreements"><ArrowLeft className="h-4 w-4 mr-2" />Back to Contracts</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border/50">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge className={`uppercase tracking-widest text-[10px] border shadow-sm ${fullyExecuted ? "bg-green-50 text-green-700 border-green-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"}`}>
              {fullyExecuted ? "Fully Executed" : (ag.status ?? "pending").replace(/_/g, " ")}
            </Badge>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Contract #{ag.id} · Booking #{ag.bookingId}
            </span>
          </div>
          <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground leading-tight">
            Engagement Agreement
          </h1>
          <p className="text-lg text-primary font-medium">
            {ag.freelancerName} <span className="text-muted-foreground font-normal px-2">&amp;</span> {ag.employerName}
          </p>
        </div>
        
        {myTurn && (
          <div className="flex-shrink-0 pt-2">
            <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="h-12 px-8 shadow-md font-semibold bg-primary hover:bg-primary/90 text-primary-foreground animate-pulse [animation-duration:3s]">
                  <PenLine className="h-5 w-5 mr-2 text-gold" />
                  Sign Document
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="pb-4 border-b border-border/50">
                  <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 border border-primary/20">
                    <Fingerprint className="h-6 w-6" />
                  </div>
                  <DialogTitle className="font-serif text-2xl text-center">Execute Contract</DialogTitle>
                  <DialogDescription className="text-center mt-2">
                    Choose how you'd like to sign this agreement.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-5">
                  {/* Signing As */}
                  <div className="rounded-xl border bg-secondary/30 px-5 py-3 flex flex-col gap-0.5 items-center text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Signing As</span>
                    <span className="font-serif text-base font-bold text-foreground capitalize">{me?.role}</span>
                    <span className="text-sm text-muted-foreground">{me?.name}</span>
                  </div>

                  {/* Option 1 — stored signature */}
                  <button
                    type="button"
                    onClick={() => storedSigPath && setSigMode("stored")}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-all ${sigMode === "stored" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"} ${!storedSigPath ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    disabled={!storedSigPath}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sigMode === "stored" ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {sigMode === "stored" && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Use Stored Signature</span>
                    </div>
                    {storedSigUrl ? (
                      <div className="bg-white rounded-lg border p-3 flex items-center justify-center min-h-[72px]">
                        <img src={storedSigUrl} alt="Your stored signature" className="max-h-16 max-w-full object-contain" />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-6">No signature saved. Go to your Profile to upload one.</p>
                    )}
                  </button>

                  {/* Option 2 — upload new */}
                  <button
                    type="button"
                    onClick={() => { setSigMode("upload"); sigFileRef.current?.click(); }}
                    className={`w-full text-left rounded-xl border-2 p-4 transition-all cursor-pointer ${sigMode === "upload" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sigMode === "upload" ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {sigMode === "upload" && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Upload Signature Image</span>
                    </div>
                    {uploadingSig ? (
                      <div className="flex items-center gap-2 pl-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />Uploading…
                      </div>
                    ) : uploadedSigPreview ? (
                      <div className="bg-white rounded-lg border p-3 flex items-center justify-center min-h-[72px]">
                        <img src={uploadedSigPreview} alt="Uploaded signature preview" className="max-h-16 max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pl-6 text-sm text-muted-foreground">
                        <Upload className="h-4 w-4" />Click to upload PNG or JPG
                      </div>
                    )}
                  </button>
                  <input
                    ref={sigFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSigUpload(f); }}
                  />

                  {/* Option 3 — type name */}
                  <div
                    className={`rounded-xl border-2 p-4 transition-all ${sigMode === "text" ? "border-primary bg-primary/5" : "border-border"}`}
                    onClick={() => setSigMode("text")}
                  >
                    <div className="flex items-center gap-2 mb-3 cursor-pointer">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sigMode === "text" ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {sigMode === "text" && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Type Your Name</span>
                    </div>
                    <Input
                      placeholder="e.g. Jefferson Immanuel"
                      value={typedName}
                      onChange={e => { setTypedName(e.target.value); setSigMode("text"); }}
                      className="font-serif text-xl italic h-12 text-center border-primary/20 bg-white"
                      onKeyDown={e => e.key === "Enter" && canSign && handleSign()}
                    />
                  </div>
                </div>

                <DialogFooter className="sm:justify-center border-t border-border/50 pt-4">
                  <Button variant="ghost" onClick={() => { setSignDialogOpen(false); setUploadedSigPath(null); setUploadedSigPreview(null); setTypedName(""); setSigMode("stored"); }}>Cancel</Button>
                  <Button
                    onClick={handleSign}
                    disabled={signAgreement.isPending || !canSign}
                    className="font-semibold shadow-sm px-8"
                  >
                    {signAgreement.isPending ? "Executing..." : "Confirm & Sign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {ag.status === "fully_signed" && (
        <div className="flex items-center gap-3 py-3 border-y border-slate-100">
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            variant="outline"
            size="sm"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Signed Agreement
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Signed PDF · TalentLock certified document
          </span>
        </div>
      )}

      {fullyExecuted && (
        <div className="flex items-start gap-4 rounded-xl border border-green-200 bg-green-50/80 p-6">
          <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-green-900">Contract Fully Executed</h3>
            <p className="text-green-800 mt-1.5 leading-relaxed font-medium">Both parties have digitally signed. The engagement terms and exclusivity period are now legally binding and active.</p>
          </div>
        </div>
      )}

      {/* Freelancer waiting banner — employer hasn't signed yet */}
      {isFreelancer && !employerSigned && (
        <div className="flex items-start gap-4 rounded-xl border border-blue-200 bg-blue-50/80 p-6">
          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-blue-900">Awaiting Employer</h3>
            <p className="text-blue-800 mt-1.5 leading-relaxed font-medium">The employer must sign the agreement first. Once completed, the document will unlock for your signature.</p>
          </div>
        </div>
      )}

      {/* Employer waiting banner — employer signed but freelancer hasn't yet */}
      {isEmployer && employerSigned && !freelancerSigned && (
        <div className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-6">
          <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-amber-900">Awaiting Freelancer's Signature</h3>
            <p className="text-amber-800 mt-1.5 leading-relaxed font-medium">You have signed. The freelancer needs to review and countersign before the agreement is fully executed and the download unlocks.</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          {/* Agreement content - Designed to look like a real document */}
          <Card className="shadow-xl border-border bg-white rounded-none sm:rounded-xl overflow-hidden">
            <div className="h-2 w-full bg-primary"></div>
            <CardHeader className="bg-primary/5 pb-6 border-b border-border/40">
              <CardTitle className="font-serif text-2xl flex items-center gap-3">
                <FileText className="h-6 w-6 text-primary" /> Master Services Agreement
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 sm:p-12">
              <LegalDocument content={ag.content ?? ""} />

              {/* Rendered signature block at bottom if signed */}
              {(employerSigned || freelancerSigned) && (
                <div className="mt-16 pt-10 border-t border-border/60">
                  <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground mb-8 text-center">Executed Signatures</h3>
                  <div className="grid sm:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Employer</div>
                      {employerSigned ? (
                        <div className="border-b border-border/80 pb-3 min-h-[72px] flex items-end">
                          {ag.employerSignatureImageUrl ? (
                            <img
                              src={`${BASE}api/storage${ag.employerSignatureImageUrl}`}
                              alt="Employer signature"
                              className="max-h-16 max-w-full object-contain"
                            />
                          ) : (
                            <div className="font-serif text-3xl italic text-primary">{ag.employerSignatureName}</div>
                          )}
                        </div>
                      ) : (
                        <div className="border-b border-border/40 border-dashed pb-2 h-16 flex items-end">
                          <span className="text-xs text-muted-foreground italic">Pending signature</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-foreground">{ag.employerName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">{ag.employerSignedAt ? format(new Date(ag.employerSignedAt), "MMM d, yyyy · HH:mm:ss 'UTC'") : ""}</div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Freelancer</div>
                      {freelancerSigned ? (
                        <div className="border-b border-border/80 pb-3 min-h-[72px] flex items-end">
                          {ag.freelancerSignatureImageUrl ? (
                            <img
                              src={`${BASE}api/storage${ag.freelancerSignatureImageUrl}`}
                              alt="Freelancer signature"
                              className="max-h-16 max-w-full object-contain"
                            />
                          ) : (
                            <div className="font-serif text-3xl italic text-primary">{ag.freelancerSignatureName}</div>
                          )}
                        </div>
                      ) : (
                        <div className="border-b border-border/40 border-dashed pb-2 h-16 flex items-end">
                          <span className="text-xs text-muted-foreground italic">Pending signature</span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-foreground">{ag.freelancerName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">{ag.freelancerSignedAt ? format(new Date(ag.freelancerSignedAt), "MMM d, yyyy · HH:mm:ss 'UTC'") : ""}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {ag.status === "redlined" && !employerSigned && !freelancerSigned && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠ This agreement was revised. Both parties must sign again.
            </div>
          )}

          {isEmployer && ag && (
            <ContractRedliningSection
              agreementId={ag.id}
              agreement={ag}
              userPlan={subscription?.plan?.id ?? "employer_starter"}
              tokensUsed={tokenUsage?.tokensUsed ?? 0}
              monthlyTokenLimit={tokenUsage?.monthlyTokenLimit ?? null}
            />
          )}

          {isEmployer && ag && (
            <ContractHealthScoreCard
              agreementId={ag.id}
              userRole="employer"
              userPlan={subscription?.plan?.id ?? "employer_starter"}
              initialScore={ag.healthScore}
              initialDetail={ag.healthScoreDetail as { dimensions?: HealthScoreDimensions; summary?: string } | null}
              onRunRedlining={() => {
                document.getElementById("contract-redlining")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          )}

          {isFreelancer && ag.status === "redlined" && (
            <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
              ℹ This agreement was revised with AI assistance before signing.
            </div>
          )}

          {isFreelancer && (
            <div className="mt-6">
              <AgreementSummaryPanel
                agreementId={ag.id}
                cachedSummary={(ag.freelancerSummary as Record<string, unknown> | null) ?? null}
                cachedAt={ag.freelancerSummaryScoredAt ?? null}
              />
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Signing Progress Tracker */}
          <Card className="shadow-sm border-border bg-card sticky top-24">
            <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
              <CardTitle className="font-serif text-xl flex items-center gap-2"><Shield className="h-5 w-5 text-muted-foreground" />Execution Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="relative pl-4 space-y-8 before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {/* Step 1: Employer */}
                <div className="relative flex items-start gap-4">
                  <div className={`absolute -left-6 h-5 w-5 rounded-full flex items-center justify-center border-2 bg-background z-10 ${employerSigned ? "border-green-500 text-green-500" : "border-primary text-primary"}`}>
                    {employerSigned ? <CheckCircle2 className="h-3 w-3" /> : <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="text-sm font-bold text-foreground">{ag.employerName}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Employer signs first</div>
                    {employerSigned ? (
                      <div className="text-xs text-green-700 font-medium mt-1.5 bg-green-50 px-2 py-1 rounded w-fit border border-green-100">
                        Signed on {format(new Date(ag.employerSignedAt!), "MMM d")}
                      </div>
                    ) : (
                      <div className="text-xs text-yellow-600 italic mt-1.5">Awaiting signature</div>
                    )}
                  </div>
                </div>

                {/* Step 2: Freelancer */}
                <div className="relative flex items-start gap-4">
                  <div className={`absolute -left-6 h-5 w-5 rounded-full flex items-center justify-center border-2 bg-background z-10 ${freelancerSigned ? "border-green-500 text-green-500" : employerSigned ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground/30"}`}>
                    {freelancerSigned ? <CheckCircle2 className="h-3 w-3" /> : !employerSigned ? <Lock className="h-2 w-2" /> : <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${employerSigned ? "text-foreground" : "text-muted-foreground"}`}>{ag.freelancerName}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Freelancer signs second</div>
                    {freelancerSigned ? (
                      <div className="text-xs text-green-700 font-medium mt-1.5 bg-green-50 px-2 py-1 rounded w-fit border border-green-100">
                        Signed on {format(new Date(ag.freelancerSignedAt!), "MMM d")}
                      </div>
                    ) : !employerSigned ? (
                      <div className="text-xs text-muted-foreground italic mt-1.5 flex items-center gap-1.5">
                        <Lock className="h-3 w-3" /> Locked
                      </div>
                    ) : (
                      <div className="text-xs text-yellow-600 italic mt-1.5">Awaiting signature</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
