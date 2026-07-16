import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, MessageSquare, RefreshCw } from "lucide-react";
import { useGetConversationsDirect, useGetMe } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InlineMessageThread } from "@/components/messages/InlineMessageThread";
import { FreelancerChatSearch } from "@/components/messages/FreelancerChatSearch";
import { cn } from "@/lib/utils";

function timeAgo(value: string | Date | null | undefined) {
  if (!value) return "";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ConversationList({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId?: number | null;
  onSelect: (id: number) => void;
  onClose?: () => void;
}) {
  const { data: user } = useGetMe();
  const conversationsQuery = useGetConversationsDirect(
    { page: 1, pageSize: 50 },
    { query: { refetchInterval: 30_000 } as any },
  );
  const conversations = conversationsQuery.data?.data ?? [];
  const isEmployer = user?.role === "employer";

  if (conversationsQuery.isLoading) {
    return (
      <div className="space-y-1 overflow-y-auto p-2">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="flex gap-3 p-3 animate-pulse">
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversationsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-destructive">Could not load conversations. Try again.</p>
        <Button variant="outline" size="sm" onClick={() => void conversationsQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Empty className="border-0 px-6 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessageSquare className="text-slate-300" /></EmptyMedia>
          <EmptyTitle className="font-serif">No conversations yet</EmptyTitle>
          <EmptyDescription className="max-w-xs">
            {isEmployer
              ? "Search for a freelancer above to start messaging. Nothing is selected until you pick someone."
              : "Conversations from employers will appear here."}
          </EmptyDescription>
        </EmptyHeader>
        {isEmployer && (
          <Button asChild variant="outline" size="sm" onClick={onClose}>
            <Link href="/freelancers">Browse Talent Vault →</Link>
          </Button>
        )}
      </Empty>
    );
  }

  return (
    <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
      {conversations.map((conversation) => (
        <button
          key={conversation.conversationId}
          type="button"
          onClick={() => onSelect(conversation.conversationId)}
          className={cn(
            "flex w-full gap-3 border-l-2 border-transparent px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
            conversation.conversationId === selectedId && "border-l-blue-500 bg-blue-50",
            conversation.unreadCount > 0 && conversation.conversationId !== selectedId && "bg-primary/5",
          )}
        >
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={conversation.otherPartyAvatar ?? undefined} />
              <AvatarFallback>{conversation.otherPartyName[0] ?? "?"}</AvatarFallback>
            </Avatar>
            {conversation.unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-blue-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span
                className={cn(
                  "truncate text-sm",
                  conversation.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                )}
              >
                {conversation.otherPartyName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conversation.lastMessageAt)}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {conversation.lastMessagePreview || "No messages yet"}
            </p>
            {(conversation.bookingTitle || conversation.meetingTitle) && (
              <span className="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                Re: {conversation.bookingTitle ?? conversation.meetingTitle}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Compact single-pane chat box: list OR thread, never side-by-side. */
export function MessagesWorkspace({
  selectedId,
  variant = "page",
  onSelectConversation,
  onClose,
}: {
  selectedId?: number | null;
  variant?: "page" | "panel";
  onSelectConversation?: (conversationId: number | null) => void;
  onClose?: () => void;
}) {
  const conversationsQuery = useGetConversationsDirect(
    { page: 1, pageSize: 50 },
    { query: { refetchInterval: 30_000 } as any },
  );
  const conversations = conversationsQuery.data?.data ?? [];
  const selectedConversation = conversations.find((c) => c.conversationId === selectedId);
  const isPanel = variant === "panel";
  const [isSearching, setIsSearching] = useState(false);

  const selectConversation = (conversationId: number | null) => {
    onSelectConversation?.(conversationId);
  };

  // Panel mode: single column — show list or thread, never both (avoids md: two-pane crush in 420px box)
  if (isPanel) {
    if (selectedId) {
      return (
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => selectConversation(null)}
              aria-label="Back to conversations"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={selectedConversation?.otherPartyAvatar ?? undefined} />
              <AvatarFallback className="text-xs">{selectedConversation?.otherPartyName[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {selectedConversation?.otherPartyName ?? "Conversation"}
              </h2>
              {(selectedConversation?.bookingTitle || selectedConversation?.meetingTitle) && (
                <p className="truncate text-[11px] text-muted-foreground">
                  Re: {selectedConversation.bookingTitle ?? selectedConversation.meetingTitle}
                </p>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <InlineMessageThread conversationId={selectedId} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col bg-card">
        <FreelancerChatSearch
          onConversationOpened={selectConversation}
          onSearchingChange={setIsSearching}
        />
        {!isSearching && (
          <>
            <div className="shrink-0 border-b border-border px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent
              </h2>
              {conversations.length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
            <ConversationList
              selectedId={selectedId}
              onSelect={selectConversation}
              onClose={onClose}
            />
          </>
        )}
        {isSearching && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Select a freelancer above to start chatting.
          </p>
        )}
      </div>
    );
  }

  // Page / deep-link fallback (unused as primary UX, kept for completeness)
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">Messages</h1>
        <p className="mt-1 text-muted-foreground">Your conversations with talent, all in one place.</p>
      </div>
      <div className="flex h-[calc(100dvh-13rem)] min-h-[520px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <aside className={cn("flex w-full flex-col bg-card md:w-[340px] md:shrink-0", selectedId ? "hidden md:flex" : "flex")}>
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-serif text-lg font-semibold">Conversations</h2>
          </div>
          <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        </aside>
        <section className={cn("min-w-0 flex-1 flex-col border-l border-border bg-background", selectedId ? "flex" : "hidden md:flex")}>
          {selectedId ? (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => selectConversation(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{selectedConversation?.otherPartyName[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <h2 className="font-semibold">{selectedConversation?.otherPartyName ?? "Conversation"}</h2>
              </div>
              <div className="min-h-0 flex-1">
                <InlineMessageThread conversationId={selectedId} />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <MessageSquare className="mb-4 h-12 w-12 text-slate-300" />
              <h2 className="font-serif text-xl font-semibold text-foreground">Select a conversation</h2>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
