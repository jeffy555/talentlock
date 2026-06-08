import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCreateAvailabilityBlock } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import {
  rangesOverlap,
  toApiDateString,
  type AvailabilityBlockLike,
} from "@/lib/availabilityUtils";

interface AddBlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingBlocks: AvailabilityBlockLike[];
  initialStartDate?: Date;
}

export function AddBlockModal({
  open,
  onOpenChange,
  existingBlocks,
  initialStartDate,
}: AddBlockModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBlock = useCreateAvailabilityBlock();

  const [reason, setReason] = useState<"holiday" | "unavailable">("holiday");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("holiday");
      setStartDate(initialStartDate);
      setEndDate(initialStartDate);
      setLabel("");
      setError(null);
    }
  }, [open, initialStartDate]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxFuture = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 365);
    return d;
  }, [today]);

  const overlapWarning = useMemo(() => {
    if (!startDate || !endDate) return false;
    const aStart = new Date(startDate);
    const aEnd = new Date(endDate);
    aStart.setHours(0, 0, 0, 0);
    aEnd.setHours(0, 0, 0, 0);
    return existingBlocks.some((b) => {
      const bStart = new Date(b.startDate);
      const bEnd = new Date(b.endDate);
      bStart.setHours(0, 0, 0, 0);
      bEnd.setHours(0, 0, 0, 0);
      return rangesOverlap(aStart, aEnd, bStart, bEnd);
    });
  }, [startDate, endDate, existingBlocks]);

  const validate = (): string | null => {
    if (!startDate || !endDate) return "Start and end dates are required.";
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (end < start) return "End date must be after start date.";
    if (end < today) return "End date cannot be in the past.";
    if (end > maxFuture) return "Blocks cannot be more than 1 year in the future.";
    if (label.length > 100) return "Label must be 100 characters or fewer.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await createBlock.mutateAsync({
        data: {
          startDate: toApiDateString(startDate!),
          endDate: toApiDateString(endDate!),
          reason,
          label: label.trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/availability/me"] });
      toast({ title: "Block added." });
      onOpenChange(false);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; error?: string };
      if (apiErr.code === "DATE_TOO_FAR") {
        setError("Blocks cannot be more than 1 year in the future.");
      } else if (apiErr.code === "DATE_IN_PAST") {
        setError("End date cannot be in the past.");
      } else if (apiErr.code === "DATE_INVALID") {
        setError("End date must be after start date.");
      } else {
        setError(apiErr.error ?? "Failed to save block.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add Unavailability Block</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Reason
            </Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="block-reason"
                  checked={reason === "holiday"}
                  onChange={() => setReason("holiday")}
                />
                Holiday
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="block-reason"
                  checked={reason === "unavailable"}
                  onChange={() => setReason("unavailable")}
                />
                Unavailable (other)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Start date
              </Label>
              <DatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                End date
              </Label>
              <DatePicker value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Label (optional)
            </Label>
            <Input
              placeholder="e.g. Client project, vacation..."
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-right">{label.length}/100</p>
          </div>

          {overlapWarning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              This range overlaps an existing block.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createBlock.isPending}>
            {createBlock.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save Block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
