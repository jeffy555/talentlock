import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useActivateTalentSearch,
  useDryRunTalentSearch,
  useDeactivateTalentSearch,
  getGetTalentSearchQueryKey,
  getGetTalentSearchStatsQueryKey,
  getListTalentSearchActivityQueryKey,
  type TalentSearchConfig,
  type TalentSearchStats,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
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
import { deriveTalentSearchStatus, formatHours } from "@/lib/talentSearchDisplayUtils";

interface TalentSearchStatusBarProps {
  config: TalentSearchConfig | null | undefined;
  stats?: TalentSearchStats;
  hasConfig: boolean;
}

export function TalentSearchStatusBar({ config, stats, hasConfig }: TalentSearchStatusBarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmLive, setConfirmLive] = useState(false);

  const activate = useActivateTalentSearch();
  const dryRun = useDryRunTalentSearch();
  const deactivate = useDeactivateTalentSearch();

  const status = deriveTalentSearchStatus(config);
  const hoursUsed = stats?.hoursUsedToday ?? config?.hoursUsedToday ?? 0;
  const dailyLimit = stats?.dailyLimitHours ?? config?.dailyLimitHours ?? 6;
  const busy = activate.isPending || dryRun.isPending || deactivate.isPending;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTalentSearchQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTalentSearchStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTalentSearchActivityQueryKey() });
  };

  const requireConfig = () => {
    toast({
      title: "Save your rules first",
      description: "Configure and save your TalentSearch rules before activating.",
    });
  };

  const guardConfig = (action: () => void) => {
    if (!hasConfig) {
      requireConfig();
      return;
    }
    action();
  };

  const runActivate = () => {
    activate.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast({ title: "TalentSearch activated", description: "Your AI assistant is now live." });
        setConfirmLive(false);
      },
      onError: () => toast({ title: "Error", description: "Could not activate TalentSearch.", variant: "destructive" }),
    });
  };

  const runDryRun = () => {
    dryRun.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Dry run enabled", description: "Profiles will be evaluated without sending messages." });
      },
      onError: () => toast({ title: "Error", description: "Could not enable dry run.", variant: "destructive" }),
    });
  };

  const runDeactivate = () => {
    deactivate.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast({ title: "TalentSearch turned off" });
      },
      onError: () => toast({ title: "Error", description: "Could not turn off.", variant: "destructive" }),
    });
  };

  const badgeBase = "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {status === "inactive" && (
          <>
            <span className={`${badgeBase} bg-slate-100 text-slate-500 border-slate-200`}>
              ○ TalentSearch is off
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => guardConfig(() => setConfirmLive(true))}>
              Turn On
            </Button>
            <Button size="sm" variant="outline" className="border-blue-200 text-blue-700" disabled={busy} onClick={() => guardConfig(runDryRun)}>
              Dry Run
            </Button>
          </>
        )}

        {status === "dry_run" && (
          <>
            <span className={`${badgeBase} bg-blue-100 text-blue-700 border-blue-300`}>
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              ● Dry Run
            </span>
            <span className="text-sm text-muted-foreground">
              {formatHours(hoursUsed)} / {formatHours(dailyLimit)} used today
            </span>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={busy} onClick={() => setConfirmLive(true)}>
              Go Live
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={runDeactivate}>
              Turn Off
            </Button>
          </>
        )}

        {status === "active" && (
          <>
            <span className={`${badgeBase} bg-emerald-100 text-emerald-700 border-emerald-300`}>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ● Active
            </span>
            <span className="text-sm text-muted-foreground">
              {formatHours(hoursUsed)} / {formatHours(dailyLimit)} used today
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={runDeactivate}>
              Turn Off
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmLive} onOpenChange={setConfirmLive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate TalentSearch?</AlertDialogTitle>
            <AlertDialogDescription>
              When active, your AI assistant will automatically express interest in matching freelancers on your
              behalf. You will be notified of every message sent. You can turn off at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-teal-600 hover:bg-teal-700"
              onClick={(e) => {
                e.preventDefault();
                guardConfig(runActivate);
              }}
            >
              Activate TalentSearch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
