import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type StatusOption = { value: string; label: string };

export function EngagementListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  status,
  statusOptions,
  onStatusChange,
  onClear,
  resultSummary,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  status: string;
  statusOptions: StatusOption[];
  onStatusChange: (value: string) => void;
  onClear: () => void;
  resultSummary?: string;
}) {
  const hasFilters = search.trim().length > 0 || (status !== "" && status !== "all");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 pr-9"
            aria-label="Search"
          />
          {search.trim() && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasFilters}
          onClick={onClear}
          className="shrink-0"
        >
          Clear filters
        </Button>
      </div>

      <div
        role="radiogroup"
        aria-label="Status filter"
        className="flex flex-wrap gap-2"
      >
        {statusOptions.map((option) => {
          const selected = status === option.value || (option.value === "all" && (status === "" || status === "all"));
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onStatusChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {resultSummary && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {resultSummary}
        </p>
      )}
    </div>
  );
}
