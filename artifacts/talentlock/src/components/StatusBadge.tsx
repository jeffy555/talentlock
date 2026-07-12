import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusKind =
  | "pending"
  | "active"
  | "locked"
  | "cancelled"
  | "completed"
  | "negotiating";

const styles: Record<StatusKind, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-primary/10 text-primary border-primary/20",
  locked: "bg-primary text-primary-foreground border-primary",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  negotiating: "bg-secondary text-secondary-foreground border-border",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: StatusKind;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[status], className)}>
      {children}
    </Badge>
  );
}
