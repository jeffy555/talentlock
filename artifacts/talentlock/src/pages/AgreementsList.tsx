import { useListAgreements, useGetMe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, PenLine, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending_signatures: "bg-yellow-100 text-yellow-800 border-yellow-200",
  signed: "bg-green-100 text-green-800 border-green-200",
  active: "bg-blue-100 text-blue-800 border-blue-200",
  expired: "bg-gray-100 text-gray-700 border-gray-200",
  terminated: "bg-red-100 text-red-800 border-red-200",
};

export default function AgreementsList() {
  const { data: me } = useGetMe();
  const { data: agreements, isLoading } = useListAgreements();

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agreements</h1>
        <p className="text-muted-foreground mt-1">Legal engagement agreements generated and signed on TalentLock.</p>
      </div>

      {!agreements || agreements.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center bg-secondary/10">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No agreements yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Agreements are generated automatically from bookings. Create a booking first.
          </p>
          <Button asChild className="mt-6"><Link href="/bookings">View Bookings</Link></Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {agreements.map((agreement) => {
            const isFullySigned = !!agreement.freelancerSignedAt && !!agreement.employerSignedAt;
            const mySignature = me?.role === "freelancer" ? agreement.freelancerSignedAt : agreement.employerSignedAt;
            const needsMySignature = !mySignature && agreement.status === "pending_signatures";

            return (
              <Card key={agreement.id} className="hover:shadow-sm transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Agreement #{agreement.id}
                        {needsMySignature && <Badge variant="destructive" className="text-xs">Needs Your Signature</Badge>}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {me?.role === "employer" ? `Freelancer: ${agreement.freelancerName}` : `Employer: ${agreement.employerName}`}
                        {" · "}Booking #{agreement.bookingId}
                      </CardDescription>
                    </div>
                    <Badge className={`capitalize border ${statusColors[agreement.status ?? "pending_signatures"] ?? "bg-secondary"}`}>
                      {(agreement.status ?? "pending").replace(/_/g, " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      {agreement.freelancerSignedAt
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <PenLine className="h-4 w-4 text-yellow-600" />}
                      <span className="text-muted-foreground">Freelancer {agreement.freelancerSignedAt ? `signed ${format(new Date(agreement.freelancerSignedAt), "MMM d")}` : "pending signature"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {agreement.employerSignedAt
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <PenLine className="h-4 w-4 text-yellow-600" />}
                      <span className="text-muted-foreground">Employer {agreement.employerSignedAt ? `signed ${format(new Date(agreement.employerSignedAt), "MMM d")}` : "pending signature"}</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant={needsMySignature ? "default" : "outline"} size="sm" asChild>
                      <Link href={`/agreements/${agreement.id}`}>{needsMySignature ? "Review & Sign" : "View Agreement"}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
