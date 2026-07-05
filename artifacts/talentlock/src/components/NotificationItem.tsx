import { useLocation } from "wouter";
import {
  Briefcase,
  FileText,
  Calendar,
  Star,
  ShieldCheck,
  CheckSquare,
  Sparkles,
  Search,
} from "lucide-react";
import { getNotificationRoute } from "@/lib/notificationRoutes";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

export interface NotificationData {
  id: number;
  type: string;
  entityType: string;
  entityId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationItemProps {
  notification: NotificationData;
  onRead: (id: number) => void;
}

function EntityIcon({ entityType }: { entityType: string }) {
  switch (entityType) {
    case "booking":
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    case "agreement":
      return <FileText className="h-4 w-4 text-violet-500" />;
    case "meeting":
      return <Calendar className="h-4 w-4 text-emerald-500" />;
    case "review":
      return <Star className="h-4 w-4 text-amber-500" />;
    case "document":
      return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
    case "milestone":
      return <CheckSquare className="h-4 w-4 text-blue-500" />;
    case "job":
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    case "cruise_mode_activity":
      return <Sparkles className="h-4 w-4 text-violet-500" />;
    case "talent_search_activity":
      return <Search className="h-4 w-4 text-teal-500" />;
    default:
      return <Briefcase className="h-4 w-4 text-slate-400" />;
  }
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const [, setLocation] = useLocation();

  return (
    <button
      type="button"
      onClick={() => {
        onRead(notification.id);
        setLocation(getNotificationRoute(notification.entityType, notification.entityId));
      }}
      className={`
        w-full text-left px-4 py-3
        flex items-start gap-3
        hover:bg-slate-50 transition-colors
        ${notification.read ? "bg-white" : "bg-blue-50"}
      `}
      data-testid={`notification-item-${notification.id}`}
    >
      {!notification.read && (
        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
      )}
      {notification.read && <span className="w-2 shrink-0" />}

      <span className="shrink-0 mt-0.5">
        <EntityIcon entityType={notification.entityType} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-slate-700 leading-snug">{notification.message}</p>
          {notification.type === "cruise_mode_interest" && (
            <span className="shrink-0 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">
              Cruise Mode ✦
            </span>
          )}
          {notification.type === "talent_search_interest" && (
            <span className="shrink-0 text-xs bg-teal-100 text-teal-700 border border-teal-200 rounded px-1.5 py-0.5">
              TalentSearch ✦
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}
