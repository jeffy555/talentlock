import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  useGetMyAvailability,
  useDeleteAvailabilityBlock,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  formatDateRange,
  formatNextAvailable,
  getAvailabilityColour,
  reasonBadgeClass,
} from "@/lib/availabilityUtils";
import { AvailabilityCalendarGrid } from "./AvailabilityCalendarGrid";
import { AddBlockModal } from "./AddBlockModal";

export function AvailabilityManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useGetMyAvailability();
  const deleteBlock = useDeleteAvailabilityBlock();

  const [addOpen, setAddOpen] = useState(false);
  const [initialStartDate, setInitialStartDate] = useState<Date | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const blocks = data?.blocks ?? [];

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteBlock.mutateAsync({ id: deleteId });
      await queryClient.invalidateQueries({ queryKey: ["/api/availability/me"] });
      toast({ title: "Block removed." });
      setDeleteId(null);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; error?: string };
      toast({
        title: apiErr.code === "BLOCK_IS_AUTO"
          ? "Cannot delete an auto-created booking block. Cancel the booking to remove it."
          : (apiErr.error ?? "Failed to delete block."),
        variant: "destructive",
      });
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[260px] w-full rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-border p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Could not load your availability.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Next available:{" "}
        <span className={`font-medium ${data?.nextAvailableDate ? "text-emerald-700" : "text-slate-400"}`}>
          {formatNextAvailable(data?.nextAvailableDate ?? null)}
        </span>
      </p>

      <AvailabilityCalendarGrid
        blocks={blocks}
        interactive
        onDayClick={(date) => {
          setInitialStartDate(date);
          setAddOpen(true);
        }}
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setInitialStartDate(undefined);
          setAddOpen(true);
        }}
      >
        + Add Block
      </Button>

      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Upcoming blocks
        </p>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No upcoming blocks. You appear as available.
          </p>
        ) : (
          blocks.map((block) => (
            <div
              key={block.id}
              className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className={`h-3 w-3 rounded-sm flex-shrink-0 ${getAvailabilityColour(block.reason)}`} />
                <span className="text-sm text-slate-700">
                  {formatDateRange(block.startDate, block.endDate)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${reasonBadgeClass(block.reason)}`}>
                  {block.reason}
                </span>
                {block.label && (
                  <span className="text-xs text-muted-foreground truncate">— {block.label}</span>
                )}
              </div>

              {!block.bookingId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => setDeleteId(block.id)}
                  disabled={deleteBlock.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground flex-shrink-0">auto</span>
              )}
            </div>
          ))
        )}
      </div>

      <AddBlockModal
        open={addOpen}
        onOpenChange={setAddOpen}
        existingBlocks={blocks}
        initialStartDate={initialStartDate}
      />

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this block?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the unavailability block from your calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep block</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteBlock.isPending}>
              {deleteBlock.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
