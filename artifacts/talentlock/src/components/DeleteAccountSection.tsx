import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, useUser } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL ?? "/";

type DeletionStatus = "pending" | "processing" | "complete" | "rejected" | null;

type StatusResponse = {
  status: DeletionStatus;
  rejectionReason: string | null;
};

export default function DeleteAccountSection() {
  const { user } = useUser();
  const { getToken, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [bookingError, setBookingError] = useState<{ count: number } | null>(null);

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${BASE}api/account/delete-request`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = (await res.json()) as StatusResponse;
          if (!cancelled) setStatus(data);
        }
      } catch {
        // Non-blocking — section still renders delete button
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const emailMatches = confirmEmail.trim() === userEmail;
  const showPending =
    status?.status === "pending" || status?.status === "processing";

  async function handleDelete() {
    if (!emailMatches || isDeleting) return;
    setIsDeleting(true);
    setBookingError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}api/account/delete-request`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === "ACTIVE_BOOKINGS_EXIST") {
          setBookingError({ count: body.bookingCount ?? 1 });
          return;
        }
        toast({
          title: "Deletion unavailable",
          description: body?.error ?? "A deletion request is already in progress.",
          variant: "destructive",
        });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Deletion failed");
      }

      setDialogOpen(false);
      toast({ title: "Your account has been deleted." });
      setTimeout(async () => {
        await signOut();
        setLocation("/");
      }, 2000);
    } catch (err: unknown) {
      toast({
        title: "Deletion failed",
        description: err instanceof Error ? err.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  if (statusLoading) return null;

  return (
    <section className="pt-8 border-t-2 border-red-200">
      <p className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3">
        Danger Zone
      </p>

      {showPending ? (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
          <p className="font-semibold">Account Deletion Pending</p>
          <p>
            Your account deletion request is being processed. You will be logged out
            automatically when complete.
          </p>
          {status?.rejectionReason && (
            <p className="text-xs mt-2">{status.rejectionReason}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">Delete Account</h3>
          <p className="text-sm text-slate-600">
            Permanently delete your TalentLock account and all associated personal data.
            This action cannot be undone.
          </p>
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            onClick={() => {
              setConfirmEmail("");
              setBookingError(null);
              setDialogOpen(true);
            }}
          >
            Delete my account
          </Button>
        </div>
      )}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This will permanently:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Anonymise your name, email, and profile data</li>
                  <li>Remove your documents, notifications, and availability blocks</li>
                  <li>Cancel your TalentLock account</li>
                </ul>
                <p>
                  Your completed bookings and reviews are retained for the other party&apos;s
                  records, but your name will appear as &quot;Deleted User&quot;.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-confirm-email" className="text-sm">
              To confirm, type your email address:
            </Label>
            <Input
              id="delete-confirm-email"
              className="text-sm border-red-300 focus-visible:ring-red-500"
              placeholder={userEmail}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              disabled={isDeleting}
            />
          </div>

          {bookingError && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
              <p>
                ⚠ You have {bookingError.count} active booking
                {bookingError.count === 1 ? "" : "s"}.
              </p>
              <p>
                Please cancel or complete all active bookings before deleting your account.
              </p>
              <Link
                href="/bookings"
                className="text-amber-900 underline font-medium"
                onClick={() => setDialogOpen(false)}
              >
                View bookings →
              </Link>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!emailMatches || isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Deleting...
                </>
              ) : (
                "Delete my account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
