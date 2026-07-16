import { MessageSquare, X } from "lucide-react";
import { useGetMessagesUnreadCount } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { MessagesWorkspace } from "@/components/messages/MessagesWorkspace";
import { useChatBox } from "@/components/messages/ChatBoxProvider";
import { cn } from "@/lib/utils";

export function FloatingChatBox() {
  const { isOpen, selectedId, openInbox, selectConversation, close } = useChatBox();
  const { data: unreadMessages } = useGetMessagesUnreadCount({
    query: { refetchInterval: 30_000 } as any,
  });
  const unreadCount = Number(unreadMessages?.count ?? 0);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div
          className={cn(
            "pointer-events-auto flex flex-col overflow-hidden border border-border bg-card shadow-2xl",
            // Fixed chat-box footprint — never two-pane; width stays messenger-sized
            "h-[min(70dvh,560px)] w-[min(calc(100vw-1.5rem),380px)] rounded-2xl",
            "max-sm:fixed max-sm:inset-x-2 max-sm:bottom-20 max-sm:h-[min(78dvh,560px)] max-sm:w-auto max-sm:rounded-2xl",
          )}
          role="dialog"
          aria-label="Messages"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gold" />
              <h2 className="font-serif text-base font-semibold tracking-tight">Messages</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={close}
              aria-label="Close messages"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MessagesWorkspace
              variant="panel"
              selectedId={selectedId}
              onSelectConversation={selectConversation}
              onClose={close}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        size="icon"
        onClick={() => {
          if (isOpen) close();
          else openInbox();
        }}
        className={cn(
          "pointer-events-auto relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30",
          "hover:bg-primary/90 hover:text-primary-foreground",
          isOpen && "bg-primary/90",
        )}
        aria-label={isOpen ? "Close messages" : "Open messages"}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
    </div>
  );
}
