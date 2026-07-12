import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useListAgreements, useGetMe } from "@workspace/api-client-react";
import { PaginationControls } from "@/components/PaginationControls";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, PenLine, CheckCircle2, Shield, ArrowRight, Sparkles, Download, Loader2 } from "lucide-react";
import { GradeBadge } from "@/components/ContractHealthScoreCard";
import { useToast } from "@/hooks/use-toast";
import { AgreementDownloadError, downloadAgreementPdf } from "@/lib/downloadUtils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

const statusColors: Record<string, { bg: string, text: string, border: string }> = {
  draft: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  redlined: { bg: "bg-primary/5", text: "text-primary", border: "border-primary/20" },
  partially_signed: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  fully_signed: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  // legacy values (pre-backfill)
  pending_signatures: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
  signed: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
};

export default function AgreementsList() {
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { toast } = useToast();
  const { getToken } = useAuth();
  const { data: me } = useGetMe();
  const { data, isLoading } = useListAgreements({ page, pageSize: 20 });
  const agreements = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const onPageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleListDownload = async (agreementId: number) => {
    setDownloadingId(agreementId);
    try {
      await downloadAgreementPdf(agreementId, getToken);
    } catch (err) {
      const message =
        err instanceof AgreementDownloadError
          ? err.message
          : "Download failed. Please try again.";
      toast({ title: message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-muted rounded animate-pulse"></div>
          <div className="h-5 w-96 bg-muted rounded animate-pulse"></div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse shadow-sm border-border bg-card h-[200px]">
              <CardHeader className="pb-2"><div className="h-6 w-1/2 bg-muted rounded"></div></CardHeader>
              <CardContent><div className="h-24 w-full bg-muted rounded"></div></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" /> Legal Agreements
        </h1>
        <p className="text-muted-foreground mt-2 font-light max-w-xl">
          Your binding engagement contracts, AI-drafted and digitally signed via TalentLock.
        </p>
      </div>

      {agreements.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="font-serif">No agreements yet</EmptyTitle>
            <EmptyDescription>
              Agreements are created from bookings once rates are agreed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {agreements.map((agreement, index) => {
            const isFullySigned = !!agreement.freelancerSignedAt && !!agreement.employerSignedAt;
            const mySignature = me?.role === "freelancer" ? agreement.freelancerSignedAt : agreement.employerSignedAt;
            const awaitingSignature =
              agreement.status === "draft" ||
              agreement.status === "redlined" ||
              agreement.status === "partially_signed" ||
              agreement.status === "pending_signatures";
            const needsMySignature = !mySignature && awaitingSignature;
            const colors = statusColors[agreement.status ?? "draft"] || { bg: "bg-secondary", text: "text-muted-foreground", border: "border-border" };

            return (
              <Card 
                key={agreement.id} 
                className={`group flex flex-col hover:shadow-lg transition-all duration-300 border-border bg-card relative overflow-hidden animate-fade-in ${needsMySignature ? 'ring-1 ring-gold/50 shadow-md shadow-gold/5' : ''}`}
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
              >
                <div className={`absolute top-0 left-0 w-full h-1.5 ${needsMySignature ? 'bg-gold' : isFullySigned ? 'bg-green-500' : 'bg-primary'} opacity-80`}></div>
                
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`uppercase tracking-widest text-[10px] border shadow-sm ${colors.bg} ${colors.text} ${colors.border}`}>
                        {(agreement.status ?? "pending").replace(/_/g, " ")}
                      </Badge>
                      {me?.role === "freelancer" && agreement.hasSummary && (
                        <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 shrink-0">
                          <Sparkles className="h-3 w-3" />
                          Summarised
                        </span>
                      )}
                      {me?.role === "employer" && agreement.healthScore != null && (
                        <GradeBadge score={agreement.healthScore} />
                      )}
                      {agreement.status === "fully_signed" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleListDownload(agreement.id);
                          }}
                          title="Download signed PDF"
                          className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors shrink-0"
                        >
                          {downloadingId === agreement.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                    {needsMySignature && (
                      <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] uppercase tracking-widest shadow-none hover:bg-destructive/10">
                        Action Required
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="font-serif text-xl leading-tight">
                    {me?.role === "employer" ? agreement.freelancerName : agreement.employerName}
                  </CardTitle>
                  <CardDescription className="text-xs uppercase tracking-widest font-bold text-muted-foreground mt-2">
                    Contract #{agreement.id} · Booking #{agreement.bookingId}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col space-y-5">
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-secondary/20 border border-border/50 text-sm">
                    {/* Freelancer Status */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Freelancer</div>
                      <div className="flex items-center gap-2 font-medium">
                        {agreement.freelancerSignedAt ? (
                          <><CheckCircle2 className="h-4 w-4 text-green-600" /> <span className="text-foreground">Signed</span></>
                        ) : (
                          <><PenLine className="h-4 w-4 text-yellow-600" /> <span className="text-muted-foreground italic">Pending</span></>
                        )}
                      </div>
                    </div>
                    {/* Employer Status */}
                    <div className="flex flex-col gap-1.5 border-l border-border/50 pl-3">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Employer</div>
                      <div className="flex items-center gap-2 font-medium">
                        {agreement.employerSignedAt ? (
                          <><CheckCircle2 className="h-4 w-4 text-green-600" /> <span className="text-foreground">Signed</span></>
                        ) : (
                          <><PenLine className="h-4 w-4 text-yellow-600" /> <span className="text-muted-foreground italic">Pending</span></>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button 
                    className={`w-full mt-auto font-semibold shadow-sm justify-between group/btn ${needsMySignature ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground shadow-none'}`} 
                    asChild
                  >
                    <Link href={`/agreements/${agreement.id}`}>
                      <span>{needsMySignature ? "Review & Sign" : "View Contract"}</span>
                      <ArrowRight className="h-4 w-4 opacity-50 group-hover/btn:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={isLoading}
      />
    </div>
  );
}
