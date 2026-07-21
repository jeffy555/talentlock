import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import {
  useCheckFreelancerSaved,
  useToggleSaveFreelancer,
  getListSavedFreelancersQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { isPlanLimitError } from "@/lib/planErrorUtils";

interface WatchlistToggleButtonProps {
  freelancerId: number;
  className?: string;
}

export function WatchlistToggleButton({ freelancerId, className = "" }: WatchlistToggleButtonProps) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data, isLoading } = useCheckFreelancerSaved(freelancerId);
  const toggle = useToggleSaveFreelancer();
  const saved = data?.saved ?? false;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await toggle.mutateAsync({ id: freelancerId });
      qc.invalidateQueries({ queryKey: getListSavedFreelancersQueryKey() });
      qc.invalidateQueries({ queryKey: [`/api/freelancers/${freelancerId}/saved`] });
    } catch (err: unknown) {
      const apiErr = err as { status?: number; data?: { code?: string } };
      const status = apiErr?.status ?? 0;
      const code = apiErr?.data?.code;
      if (isPlanLimitError(status, code)) {
        toast({
          title: "Watchlist limit reached",
          description: "Upgrade your plan to save more freelancers. Redirecting to pricing…",
          variant: "destructive",
        });
        setTimeout(() => setLocation("/pricing"), 1200);
        return;
      }
      toast({ title: "Failed to update watchlist", variant: "destructive" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={toggle.isPending || isLoading}
      className={`absolute top-4 left-4 z-10 p-1.5 rounded-full transition-all shadow-sm border disabled:opacity-50 ${
        saved
          ? "bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100"
          : "bg-card border-border text-muted-foreground hover:text-rose-400 hover:border-rose-200 hover:bg-rose-50"
      } ${className}`}
      aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Heart className={`w-3.5 h-3.5 ${saved ? "fill-rose-500" : ""}`} />
    </button>
  );
}
