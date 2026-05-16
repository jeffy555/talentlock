import { useParams } from "wouter";
import { useGetAgreement, useSignAgreement, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock, FileText, PenLine, Shield, Lock, Fingerprint, Download, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState } from "react";

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

export default function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: agreement, isLoading, refetch } = useGetAgreement(parseInt(id!), { query: { enabled: !!id } as any });
  const signAgreement = useSignAgreement();
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  const ag = agreement as typeof agreement & {
    employerSignatureName?: string | null;
    freelancerSignatureName?: string | null;
  };

  const isEmployer = me?.role === "employer";
  const isFreelancer = me?.role === "freelancer";
  const [downloading, setDownloading] = useState(false);

  const myDownloadedAt = isEmployer
    ? (ag as any)?.employerDownloadedAt as string | null | undefined
    : (ag as any)?.freelancerDownloadedAt as string | null | undefined;

  const handleDownload = async () => {
    if (myDownloadedAt) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/agreements/${id}/download`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ title: "Download failed", description: body.error ?? "Could not download.", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TalentLock-Agreement-${id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Document downloaded", description: "Your copy has been saved. This download cannot be repeated." });
      refetch();
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
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

  const handleSign = async () => {
    if (!me?.role || me.role === "pending" || !signatureName.trim()) return;
    try {
      await signAgreement.mutateAsync({
        id: parseInt(id!),
        data: { role: me.role as "freelancer" | "employer", signatureName: signatureName.trim() } as any,
      });
      toast({
        title: "Contract Executed",
        description: fullyExecuted
          ? "Both parties have signed. The engagement is now legally active."
          : "Your signature has been recorded. The other party has been notified.",
      });
      setSignDialogOpen(false);
      setSignatureName("");
      refetch();
    } catch (err: any) {
      toast({
        title: "Signing failed",
        description: err?.response?.data?.error ?? err?.message ?? "Could not sign the agreement.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
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
              <DialogContent className="sm:max-w-[450px]">
                <DialogHeader className="pb-4 border-b border-border/50">
                  <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 border border-primary/20">
                    <Fingerprint className="h-6 w-6" />
                  </div>
                  <DialogTitle className="font-serif text-2xl text-center">Execute Contract</DialogTitle>
                  <DialogDescription className="text-center mt-2">
                    Type your full legal name below. This acts as your binding digital signature.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-6">
                  <div className="rounded-xl border bg-secondary/30 px-5 py-4 flex flex-col gap-1 items-center text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Signing As</span>
                    <span className="font-serif text-lg font-bold text-foreground capitalize">{me?.role}</span>
                    <span className="text-sm font-medium">{me?.name}</span>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="sig-name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Legal Signature</Label>
                    <Input
                      id="sig-name"
                      placeholder="e.g. Jefferson Immanuel"
                      value={signatureName}
                      onChange={e => setSignatureName(e.target.value)}
                      className="font-serif text-2xl italic h-16 text-center border-primary/30 focus-visible:ring-primary shadow-inner bg-secondary/10"
                      onKeyDown={e => e.key === "Enter" && signatureName.trim() && handleSign()}
                      autoFocus
                    />
                  </div>
                </div>
                <DialogFooter className="sm:justify-center border-t border-border/50 pt-4">
                  <Button variant="ghost" onClick={() => { setSignDialogOpen(false); setSignatureName(""); }}>Cancel</Button>
                  <Button
                    onClick={handleSign}
                    disabled={signAgreement.isPending || !signatureName.trim()}
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
                        <div className="border-b border-border/80 pb-2">
                          <div className="font-serif text-3xl italic text-primary">{ag.employerSignatureName}</div>
                        </div>
                      ) : (
                        <div className="border-b border-border/40 border-dashed pb-2 h-10 flex items-end">
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
                        <div className="border-b border-border/80 pb-2">
                          <div className="font-serif text-3xl italic text-primary">{ag.freelancerSignatureName}</div>
                        </div>
                      ) : (
                        <div className="border-b border-border/40 border-dashed pb-2 h-10 flex items-end">
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
        </div>

        <div className="space-y-6">
          {/* TalentLock Vault - one-time download */}
          {fullyExecuted && (
            <Card className={`shadow-sm border-2 overflow-hidden ${myDownloadedAt ? "border-muted-foreground/20 bg-muted/30" : "border-primary/30 bg-primary/5"}`}>
              <div className={`h-1.5 w-full ${myDownloadedAt ? "bg-muted-foreground/20" : "bg-primary"}`} />
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <Lock className={`h-4 w-4 ${myDownloadedAt ? "text-muted-foreground" : "text-primary"}`} />
                  TalentLock Vault
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {myDownloadedAt ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-lg">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />Downloaded {format(new Date(myDownloadedAt), "MMM d, yyyy")}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">Your one-time download has been used. The document is stored securely in this vault.</p>
                    <Button variant="outline" disabled className="w-full h-9 text-xs font-medium gap-1.5 opacity-50 cursor-not-allowed">
                      <Download className="h-3.5 w-3.5" />Already Downloaded
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      <p className="font-semibold text-foreground mb-1">Signed contract ready</p>
                      Download your certified copy of this executed agreement. <span className="font-semibold text-primary">This download can only be used once.</span>
                    </div>
                    <Button onClick={handleDownload} disabled={downloading} className="w-full h-10 font-semibold shadow-sm gap-2">
                      <Download className="h-4 w-4" />{downloading ? "Preparing…" : "Download My Copy"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
