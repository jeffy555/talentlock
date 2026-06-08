import { useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useAcceptTeamInvite,
  getGetTeamQueryKey,
  getGetMySubscriptionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

function parseToken(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("token");
}

export default function AcceptInvite() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const token = parseToken(search);

  const { data, isLoading, error, isSuccess } = useAcceptTeamInvite(
    { token: token ?? "" },
    {
      query: {
        enabled: !!token && !!isSignedIn,
        retry: false,
      } as any,
    },
  );

  const errorStatus =
    error && typeof error === "object" && "status" in error
      ? (error as { status: number }).status
      : null;

  const errorBody =
    error && typeof error === "object" && "response" in error
      ? (error as { response?: { data?: { error?: string; code?: string; teamName?: string } } }).response?.data
      : undefined;

  useEffect(() => {
    if (!token) return;
    if (!isSignedIn) {
      setLocation(`/sign-up?invite_token=${encodeURIComponent(token)}`);
    }
  }, [token, isSignedIn, setLocation]);

  useEffect(() => {
    if (isSuccess && data) {
      queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
    }
  }, [isSuccess, data, queryClient]);

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <p className="text-muted-foreground">Invalid invitation link.</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Redirecting to sign up…</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Accepting your invitation...</p>
      </div>
    );
  }

  if (errorStatus === 410) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-medium text-foreground">This invitation has expired.</p>
          <p className="text-muted-foreground">
            Please ask your team admin to send a new invite.
          </p>
        </div>
      </div>
    );
  }

  if (errorStatus === 409 || errorBody?.code === "INVITE_USED") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-medium text-foreground">This invitation has already been accepted.</p>
          <p className="text-muted-foreground">
            If you need access, contact your team admin.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to Dashboard →</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-medium text-foreground">Unable to accept invitation</p>
          <p className="text-muted-foreground">
            {errorBody?.error ?? "The link may be invalid or expired."}
          </p>
        </div>
      </div>
    );
  }

  if (data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4 animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h1 className="font-serif text-2xl font-bold">✓ Welcome to {data.teamName}!</h1>
          <p className="text-muted-foreground">
            You&apos;ve joined the team. You now have access to all enterprise features shared with your team.
          </p>
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard →</Link>
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
