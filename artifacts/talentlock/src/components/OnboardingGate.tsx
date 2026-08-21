import { useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Link, Redirect } from "wouter";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";

const ME_CHECK_TIMEOUT_MS = 8000;

/** True until the user finishes registration (`role` is freelancer or employer). */
export function needsOnboarding(
  user: { role?: string | null } | null | undefined,
): boolean {
  if (!user) return true;
  return user.role !== "freelancer" && user.role !== "employer";
}

export function isRegistrationComplete(
  user: { role?: string | null } | null | undefined,
): boolean {
  return !!user && (user.role === "freelancer" || user.role === "employer");
}

/** Shown only while `/users/me` has no result yet. Always offers a way out. */
export function RegistrationCheckStatus({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-foreground">Checking your registration…</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          If your account is complete, you will open the dashboard. If signup is not finished,
          or this check fails, you will return to the home page to continue registration or sign out.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Continue registration
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function useMeCheckTimedOut(hasResult: boolean) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (hasResult) {
      setTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setTimedOut(true), ME_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [hasResult]);

  return timedOut;
}

/**
 * Blocks app routes until onboarding is complete.
 * Use `allowPending` on `/onboarding` so incomplete users can finish registration.
 * Uses `replace` so browser Back does not re-open blocked app pages (e.g. dashboard).
 */
export function OnboardingGate({
  allowPending = false,
  children,
}: {
  allowPending?: boolean;
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const { data: me, isLoading, isError, isSuccess } = useGetMe();
  const timedOut = useMeCheckTimedOut(isSuccess || isError);

  const handleSignOut = () => {
    queryClient.clear();
    void signOut({ redirectUrl: "/" });
  };

  // Wait only for the first settled result. Do not spin on later refetches,
  // and do not treat a pending (incomplete) account as "still checking".
  const waitingForFirstResult = !timedOut && !isError && !isSuccess && isLoading;

  if (waitingForFirstResult) {
    return <RegistrationCheckStatus onSignOut={handleSignOut} />;
  }

  const incomplete = timedOut || isError || !isSuccess || needsOnboarding(me);

  // Check failed or signup unfinished → home, not an endless spinner.
  if (incomplete && !allowPending) {
    return <Redirect to="/" replace />;
  }

  if (!incomplete && allowPending && isRegistrationComplete(me)) {
    return <Redirect to="/dashboard" replace />;
  }

  return <>{children}</>;
}
