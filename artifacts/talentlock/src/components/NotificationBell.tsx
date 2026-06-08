import { useState } from "react";
import { Bell } from "lucide-react";
import { useGetNotificationsUnreadCount } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UnreadBadge } from "@/components/UnreadBadge";
import { NotificationPanel } from "@/components/NotificationPanel";

interface NotificationBellProps {
  userId?: number;
  triggerClassName?: string;
}

export function NotificationBell({ userId, triggerClassName }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useGetNotificationsUnreadCount({
    query: {
      enabled: !!userId,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    } as any,
  });

  const unreadCount = data?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${triggerClassName ?? ""}`}
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {!isLoading && unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(380px,calc(100vw-2rem))] p-0 shadow-lg border border-slate-200 rounded-lg"
        align="end"
        sideOffset={8}
      >
        <NotificationPanel open={open} userId={userId} />
      </PopoverContent>
    </Popover>
  );
}
