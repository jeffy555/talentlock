import { useParams } from "wouter";
import { useGetAgreement, useSignAgreement, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, FileText, PenLine, Shield } from "lucide-react";
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

  const handleSign = async () => {
    if (!me?.role || me.role === "pending") return;
    try {
      await signAgreement.mutateAsync({ id: parseInt(id!), data: { role: me.role as "freelancer" | "employer" } });
      toast({ title: "Agreement signed!", description: "Your signature has been recorded on the agreement." });
      setSignDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast({ title: "Signing failed", description: err?.message ?? "Could not sign the agreement.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!agreement) return <div className="text-center py-20 text-muted-foreground">Agreement not found.</div>;

  const mySignature = me?.role === "freelancer" ? agreement.freelancerSignedAt : agreement.employerSignedAt;
  const canSign = !mySignature && agreement.status === "pending_signatures";

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild><Link href="/agreements"><ArrowLeft className="h-4 w-4 mr-2" />Back to Agreements</Link></Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><FileText className="h-8 w-8 text-muted-foreground" />Agreement #{agreement.id}</h1>
          <p className="text-muted-foreground mt-1">Booking #{agreement.bookingId} · Between {agreement.freelancerName} and {agreement.employerName}</p>
        </div>
        <Badge className={`capitalize border ${agreement.status === "signed" ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}`}>
          {(agreement.status ?? "pending").replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5" />Agreement Content</CardTitle>
              <CardDescription>AI-generated legal engagement agreement. Review carefully before signing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none bg-secondary/20 rounded-md p-6">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{agreement.content}</pre>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Signature Status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                {agreement.freelancerSignedAt
                  ? <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  : <PenLine className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />}
                <div>
                  <div className="text-sm font-medium">{agreement.freelancerName}</div>
                  <div className="text-xs text-muted-foreground">Freelancer</div>
                  {agreement.freelancerSignedAt && (
                    <div className="text-xs text-green-600 mt-1">Signed {format(new Date(agreement.freelancerSignedAt), "MMM d, yyyy")}</div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                {agreement.employerSignedAt
                  ? <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  : <PenLine className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />}
                <div>
                  <div className="text-sm font-medium">{agreement.employerName}</div>
                  <div className="text-xs text-muted-foreground">Employer</div>
                  {agreement.employerSignedAt && (
                    <div className="text-xs text-green-600 mt-1">Signed {format(new Date(agreement.employerSignedAt), "MMM d, yyyy")}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {canSign && (
            <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full"><PenLine className="h-4 w-4 mr-2" />Sign Agreement</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Your Signature</DialogTitle>
                  <DialogDescription>
                    By signing, you confirm you have read and agree to all terms in this agreement. Your digital signature will be legally binding.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 bg-secondary/20 rounded-md px-4 text-sm">
                  <p className="font-medium">Signing as: <span className="capitalize">{me?.role}</span></p>
                  <p className="text-muted-foreground mt-1">{me?.name}</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSignDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSign} disabled={signAgreement.isPending}>
                    {signAgreement.isPending ? "Signing..." : "Confirm & Sign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {mySignature && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>You signed on {format(new Date(mySignature), "MMMM d, yyyy")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
