import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetConversationsIdMessages,
  useGetMe,
  usePostConversationsIdMessages,
  usePatchConversationsIdRead,
  getGetConversationsIdMessagesQueryKey,
  getGetConversationsDirectQueryKey,
  getGetMessagesUnreadCountQueryKey,
  type HumanMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function messageTime(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function messageDay(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function InlineMessageThread({
  conversationId,
  compact = false,
}: {
  conversationId: number;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<HumanMessage[]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const markedRead = useRef(false);
  const messagesQuery = useGetConversationsIdMessages(
    conversationId,
    { page: 1, pageSize: 100 },
    { query: { refetchInterval: 30_000 } as any },
  );
  const markRead = usePatchConversationsIdRead();
  const sendMessage = usePostConversationsIdMessages();

  useEffect(() => {
    markedRead.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (markedRead.current) return;
    markedRead.current = true;
    void markRead.mutateAsync({ id: conversationId }).then(() => {
      void queryClient.invalidateQueries({
        queryKey: getGetConversationsIdMessagesQueryKey(conversationId, { page: 1, pageSize: 100 }),
      });
      void queryClient.invalidateQueries({
        queryKey: getGetConversationsDirectQueryKey({ page: 1, pageSize: 50 }),
      });
      void queryClient.invalidateQueries({ queryKey: getGetMessagesUnreadCountQueryKey() });
    }).catch(() => undefined);
  }, [conversationId, queryClient]);

  const messages = useMemo(
    () => [...(messagesQuery.data?.data ?? []), ...optimistic],
    [messagesQuery.data?.data, optimistic],
  );

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sendMessage.isPending || rateLimited) return;
    const optimisticMessage: HumanMessage = {
      id: -Date.now(),
      conversationId,
      content,
      senderId: user?.id ?? null,
      senderType: "human",
      senderName: user?.name ?? null,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    setOptimistic((current) => [...current, optimisticMessage]);
    setDraft("");
    try {
      await sendMessage.mutateAsync({ id: conversationId, data: { content } });
      setOptimistic((current) => current.filter((message) => message.id !== optimisticMessage.id));
      await queryClient.invalidateQueries({
        queryKey: getGetConversationsIdMessagesQueryKey(conversationId, { page: 1, pageSize: 100 }),
      });
    } catch (error: any) {
      setOptimistic((current) => current.filter((message) => message.id !== optimisticMessage.id));
      if (error?.status === 429 || error?.response?.status === 429) {
        setRateLimited(true);
      } else {
        toast({
          title: "Message failed to send",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", compact && "max-h-96")}>
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messagesQuery.isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading messages...
          </div>
        )}
        {!messagesQuery.isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm">No messages yet. Send the first one!</p>
          </div>
        )}
        {messages.map((message, index) => {
          const isOwn = message.senderId === user?.id;
          const currentDay = new Date(message.createdAt).toDateString();
          const previousDay = index > 0 ? new Date(messages[index - 1].createdAt).toDateString() : null;
          return (
            <div key={`${message.id}`}>
              {currentDay !== previousDay && (
                <div className="my-4 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{messageDay(message.createdAt)}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
                {!isOwn && (
                  <Avatar className="mt-1 h-7 w-7">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="text-xs">{message.senderName?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                )}
                <div className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2.5",
                  isOwn ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-slate-100 text-slate-800",
                  message.id < 0 && "opacity-60",
                )}>
                  <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  <p className={cn("mt-1 text-[10px]", isOwn ? "text-primary-foreground/70" : "text-slate-400")}>
                    {messageTime(message.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border p-3 bg-card">
        {rateLimited && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            You've sent too many messages in the last hour. Please wait before sending more.
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type a message..."
              className="min-h-[44px] max-h-32 resize-none pr-16"
              rows={1}
              disabled={sendMessage.isPending || rateLimited}
            />
            {draft.length > 1800 && (
              <span className={cn(
                "absolute bottom-2 right-2 text-[10px]",
                draft.length >= 2000 ? "text-red-600" : "text-amber-600",
              )}>
                {draft.length}/2000
              </span>
            )}
          </div>
          <Button onClick={() => void handleSend()} disabled={!draft.trim() || sendMessage.isPending || rateLimited} className="h-11 px-4">
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
