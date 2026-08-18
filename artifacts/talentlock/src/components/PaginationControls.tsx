import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  total?: number;
  pageSize?: number;
}

export function PaginationControls({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  total,
  pageSize,
}: PaginationControlsProps) {
  if (total === 0) return null;

  const showPager = totalPages > 1;
  const from = total != null && pageSize != null && total > 0
    ? (page - 1) * pageSize + 1
    : null;
  const to = total != null && pageSize != null && total > 0
    ? Math.min(page * pageSize, total)
    : null;

  if (!showPager && from == null) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
      {from != null && to != null && total != null ? (
        <p className="text-muted-foreground">
          Showing {from}–{to} of {total}
        </p>
      ) : (
        <span />
      )}
      {showPager && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
          >
            ← Prev
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
