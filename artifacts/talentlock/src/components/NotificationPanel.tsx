import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  getGetNotificationsUnreadCountQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationItem } from "@/components/NotificationItem";

interface NotificationPanelProps {
  open: boolean;
  userId?: number;
}

export function NotificationPanel({ open, userId }: NotificationPanelProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useListNotifications(
    { page: 1, pageSize: 20 },
    {
      query: {
        enabled: open && !!userId,
        queryKey: [...getListNotificationsQueryKey({ page: 1, pageSize: 20 }), userId ?? "anon"],
      } as any,
    },
  );

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const hasUnread = notifications.some((n) => !n.read);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetNotificationsUnreadCountQueryKey() });
  };

  const handleRead = (id: number) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.read) return;
    markRead.mutate(
      { id },
      { onSuccess: () => invalidate() },
    );
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, { onSuccess: () => invalidate() });
  };

  const today = notifications.filter(
    (n) => new Date(n.createdAt).toDateString() === new Date().toDateString(),
  );
  const earlier = notifications.filter(
    (n) => new Date(n.createdAt).toDateString() !== new Date().toDateString(),
  );

  return (
    <div className="font-sans">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-blue-600 hover:text-blue-700 h-auto py-0"
            onClick={handleMarkAllRead}
            data-testid="button-mark-all-read"
          >
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {isLoading && (
          <div className="divide-y divide-slate-100">
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-16 w-full rounded-none" />
            <Skeleton className="h-16 w-full rounded-none" />
          </div>
        )}

        {isError && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Could not load notifications.{" "}
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && notifications.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p>No notifications yet.</p>
            <p className="text-xs mt-1">
              You&apos;ll be notified when something needs your attention.
            </p>
          </div>
        )}

        {!isLoading && !isError && notifications.length > 0 && (
          <div>
            {today.length > 0 && (
              <>
                <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
                  Today
                </p>
                {today.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleRead} />
                ))}
              </>
            )}
            {earlier.length > 0 && (
              <>
                <p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
                  Earlier
                </p>
                {earlier.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleRead} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
