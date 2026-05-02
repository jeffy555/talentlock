import { useParams } from "wouter";
import { useGetAgreement, useSignAgreement, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock, FileText, PenLine, Shield, Lock } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useState } from "react";

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
        title: "Agreement signed!",
        description: fullyExecuted
          ? "Both parties have signed. The engagement is now active."
          : "Your signature has been recorded. The other party will be notified.",
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
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!ag) return <div className="text-center py-20 text-muted-foreground">Agreement not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agreements"><ArrowLeft className="h-4 w-4 mr-2" />Back to Agreements</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />Agreement #{ag.id}
          </h1>
          <p className="text-muted-foreground mt-1">
            Booking #{ag.bookingId} · {ag.freelancerName} &amp; {ag.employerName}
          </p>
        </div>
        <Badge className={`capitalize border text-sm ${fullyExecuted ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}`}>
          {fullyExecuted ? "Fully Executed" : (ag.status ?? "pending").replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Signing Progress Steps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />Signing Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-0">
            {/* Step 1: Employer */}
            <div className="flex items-center gap-3 flex-1">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${employerSigned ? "bg-green-600" : "bg-primary"}`}>
                {employerSigned ? <CheckCircle2 className="h-5 w-5 text-white" /> : <span className="text-white text-sm font-bold">1</span>}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{ag.employerName}</div>
                <div className="text-xs text-muted-foreground">Employer signs first</div>
                {employerSigned && ag.employerSignedAt && (
                  <div className="text-xs text-green-700 mt-0.5 font-medium">
                    ✓ {ag.employerSignatureName ?? "Signed"} · {format(new Date(ag.employerSignedAt), "MMM d, yyyy")}
                  </div>
                )}
                {!employerSigned && <div className="text-xs text-yellow-600 mt-0.5">Awaiting signature</div>}
              </div>
            </div>

            {/* Connector */}
            <div className={`h-0.5 w-12 flex-shrink-0 mx-2 ${employerSigned ? "bg-green-400" : "bg-border"}`} />

            {/* Step 2: Freelancer */}
            <div className="flex items-center gap-3 flex-1">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${freelancerSigned ? "bg-green-600" : employerSigned ? "bg-primary" : "bg-muted"}`}>
                {freelancerSigned
                  ? <CheckCircle2 className="h-5 w-5 text-white" />
                  : employerSigned
                  ? <span className="text-white text-sm font-bold">2</span>
                  : <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{ag.freelancerName}</div>
                <div className="text-xs text-muted-foreground">Freelancer signs second</div>
                {freelancerSigned && ag.freelancerSignedAt && (
                  <div className="text-xs text-green-700 mt-0.5 font-medium">
                    ✓ {ag.freelancerSignatureName ?? "Signed"} · {format(new Date(ag.freelancerSignedAt), "MMM d, yyyy")}
                  </div>
                )}
                {!freelancerSigned && !employerSigned && <div className="text-xs text-muted-foreground mt-0.5">Locked until employer signs</div>}
                {!freelancerSigned && employerSigned && <div className="text-xs text-yellow-600 mt-0.5">Awaiting your signature</div>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Freelancer waiting banner */}
      {isFreelancer && !employerSigned && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Clock className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Waiting for the employer to sign first</p>
            <p className="text-blue-700 mt-0.5">Once {ag.employerName} signs, you'll be able to add your signature here.</p>
          </div>
        </div>
      )}

      {/* Sign action */}
      {myTurn && (
        <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="w-full gap-2">
              <PenLine className="h-5 w-5" />
              {isEmployer ? "Sign as Employer" : "Sign as Freelancer"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" />Add Your Signature</DialogTitle>
              <DialogDescription>
                Type your full legal name below to sign this agreement. This acts as your digital signature and is legally binding.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-secondary/40 px-4 py-3 text-sm space-y-1">
                <div className="text-muted-foreground text-xs">Signing as</div>
                <div className="font-semibold capitalize">{me?.role} — {me?.name}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sig-name">Full Name (as signature)</Label>
                <Input
                  id="sig-name"
                  placeholder="e.g. Jefferson Immanuel"
                  value={signatureName}
                  onChange={e => setSignatureName(e.target.value)}
                  className="font-serif text-lg italic"
                  onKeyDown={e => e.key === "Enter" && signatureName.trim() && handleSign()}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Type your name exactly as you want it to appear on the agreement.</p>
              </div>
              {signatureName.trim() && (
                <div className="rounded-lg border border-dashed p-4">
                  <div className="text-xs text-muted-foreground mb-1">Preview</div>
                  <div className="font-serif text-2xl italic text-foreground">{signatureName}</div>
                  <div className="text-xs text-muted-foreground mt-1">{format(new Date(), "MMMM d, yyyy")}</div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSignDialogOpen(false); setSignatureName(""); }}>Cancel</Button>
              <Button
                onClick={handleSign}
                disabled={signAgreement.isPending || !signatureName.trim()}
              >
                {signAgreement.isPending ? "Signing..." : "Confirm & Sign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {fullyExecuted && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Agreement fully executed — Engagement is now Active</p>
            <p className="text-green-700 text-sm mt-0.5">Both parties have signed. The exclusivity period is in effect.</p>
          </div>
        </div>
      )}

      {/* Agreement content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />Agreement Content
          </CardTitle>
          <CardDescription>AI-generated legal engagement agreement. Review all sections carefully before signing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-white border rounded-lg p-6 md:p-8 space-y-0">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{ag.content}</pre>

            {/* Rendered signature block at bottom if signed */}
            {(employerSigned || freelancerSigned) && (
              <div className="mt-8 pt-6 border-t space-y-6">
                <h3 className="font-bold text-base">EXECUTED SIGNATURES</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2 border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Employer</div>
                    <div className="text-sm font-semibold">{ag.employerName}</div>
                    {employerSigned ? (
                      <>
                        <div className="font-serif text-2xl italic border-b pb-1 text-primary">{ag.employerSignatureName}</div>
                        <div className="text-xs text-muted-foreground">{ag.employerSignedAt ? format(new Date(ag.employerSignedAt), "MMMM d, yyyy") : ""}</div>
                        <Badge className="bg-green-100 text-green-800 border-green-200 border text-xs">Signed</Badge>
                      </>
                    ) : (
                      <div className="text-xs text-yellow-600 italic">Awaiting signature</div>
                    )}
                  </div>
                  <div className="space-y-2 border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Freelancer</div>
                    <div className="text-sm font-semibold">{ag.freelancerName}</div>
                    {freelancerSigned ? (
                      <>
                        <div className="font-serif text-2xl italic border-b pb-1 text-primary">{ag.freelancerSignatureName}</div>
                        <div className="text-xs text-muted-foreground">{ag.freelancerSignedAt ? format(new Date(ag.freelancerSignedAt), "MMMM d, yyyy") : ""}</div>
                        <Badge className="bg-green-100 text-green-800 border-green-200 border text-xs">Signed</Badge>
                      </>
                    ) : (
                      <div className="text-xs text-yellow-600 italic">Awaiting signature</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
