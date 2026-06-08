import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  useGetMe,
  useGetMySubscription,
  useGetTeam,
  useCreateTeam,
  useInviteTeamMember,
  useRemoveTeamMember,
  getGetTeamQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Users, Loader2, X, BarChart3 } from "lucide-react";
import type { TeamMember } from "@workspace/api-client-react";

function InviteDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const invite = useInviteTeamMember();

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await invite.mutateAsync({ data: { email: trimmed, role } });
      toast({ title: `Invitation sent to ${trimmed}.` });
      setEmail("");
      setRole("member");
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast({
        title: "Could not send invitation",
        description: message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  checked={role === "member"}
                  onChange={() => setRole("member")}
                />
                Member
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  checked={role === "admin"}
                  onChange={() => setRole("admin")}
                />
                Admin
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={invite.isPending || !email.trim()}>
            {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function memberLabel(member: TeamMember, currentUserId?: number): string {
  if (member.status === "invited") return member.invitedEmail;
  if (member.displayName) return member.displayName;
  return member.displayEmail;
}

function MemberRow({
  member,
  ownerUserId,
  isAdmin,
  currentUserId,
  onRemove,
}: {
  member: TeamMember;
  ownerUserId: number;
  isAdmin: boolean;
  currentUserId?: number;
  onRemove: (member: TeamMember) => void;
}) {
  const isTeamOwner = member.userId != null && member.userId === ownerUserId;
  const canRemove =
    isAdmin &&
    !isTeamOwner &&
    member.role !== "admin" &&
    member.status !== "deactivated";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 text-sm">{memberLabel(member, currentUserId)}</td>
      <td className="py-3 pr-4 text-sm capitalize">{member.role}</td>
      <td className="py-3 pr-4">
        <Badge
          variant="outline"
          className={
            member.status === "active"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : member.status === "invited"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : ""
          }
        >
          {member.status === "active" ? "Active" : member.status === "invited" ? "Invited" : member.status}
        </Badge>
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        {member.joinedAt
          ? format(new Date(member.joinedAt), "MMM d, yyyy")
          : member.invitedAt
            ? format(new Date(member.invitedAt), "MMM d, yyyy")
            : "—"}
      </td>
      <td className="py-3 text-right">
        {canRemove ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(member)}
            aria-label="Remove member"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </td>
    </tr>
  );
}

export default function Team() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const { data: subscription } = useGetMySubscription({ query: { enabled: !!user } as any });
  const planId = subscription?.plan?.id ?? "employer_starter";
  const isEnterprise = planId === "employer_enterprise";

  const {
    data: teamData,
    isLoading,
    error,
    refetch,
  } = useGetTeam({
    query: {
      enabled: !!user && isEnterprise,
      retry: (count: number, err: unknown) => {
        if (err && typeof err === "object" && "status" in err) {
          const status = (err as { status: number }).status;
          if (status === 403 || status === 404) return false;
        }
        return count < 1;
      },
    } as any,
  });

  const createTeam = useCreateTeam();
  const removeMember = useRemoveTeamMember();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);

  const teamErrorStatus =
    error && typeof error === "object" && "status" in error
      ? (error as { status: number }).status
      : null;

  useEffect(() => {
    if (teamErrorStatus === 402) setLocation("/pricing");
  }, [teamErrorStatus, setLocation]);

  if (!user) return null;

  if (user.role !== "employer") {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 text-muted-foreground">
        Team accounts are available for employer accounts only.
      </div>
    );
  }

  if (!isEnterprise) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="border border-dashed border-slate-300 bg-slate-50 rounded-xl p-8 text-center space-y-4">
          <Users className="h-10 w-10 mx-auto text-slate-400" />
          <h1 className="font-serif text-2xl font-bold">👥 Team Accounts — Enterprise feature</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Invite multiple hiring managers to share your freelancer pool, shortlists, and analytics.
          </p>
          <Button asChild>
            <Link href="/pricing">Upgrade to Enterprise →</Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleCreateTeam = async () => {
    try {
      await createTeam.mutateAsync({ data: {} });
      queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey() });
      toast({ title: "Team created", description: "Your team is ready. Invite your first member." });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast({
        title: "Could not create team",
        description: message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMember.mutateAsync({ memberId: removeTarget.id });
      queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey() });
      toast({ title: "Member removed" });
      setRemoveTarget(null);
    } catch {
      toast({ title: "Could not remove member", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading team…
      </div>
    );
  }

  if (!teamData && (teamErrorStatus === 403 || teamErrorStatus === 404)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1">Set up your enterprise team to invite hiring managers.</p>
        </div>
        <div className="border border-dashed border-border rounded-xl p-8 text-center space-y-4 bg-card">
          <Users className="h-10 w-10 mx-auto text-gold" />
          <p className="text-muted-foreground">You haven&apos;t created a team yet.</p>
          <Button onClick={handleCreateTeam} disabled={createTeam.isPending}>
            {createTeam.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create team"}
          </Button>
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load team. <Button variant="link" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const activeMembers = teamData.members.filter((m) => m.status !== "deactivated");

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            {teamData.team.name}
            {teamData.isAdmin && (
              <Badge variant="outline" className="text-xs">Admin</Badge>
            )}
          </p>
        </div>
        {teamData.isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/team/analytics">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </Link>
            </Button>
            <Button onClick={() => setInviteOpen(true)}>Invite member</Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Members ({activeMembers.length})</h2>
        </div>
        <div className="overflow-x-auto px-6">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="py-3 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Role</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Joined</th>
                <th className="py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  ownerUserId={teamData.team.ownerUserId}
                  isAdmin={teamData.isAdmin}
                  currentUserId={user.id}
                  onRemove={setRemoveTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey() })}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget ? memberLabel(removeTarget, user.id) : ""} from the team?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access to all team features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
