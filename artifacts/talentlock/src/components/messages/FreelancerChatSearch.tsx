import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";
import {
  useGetMe,
  useListFreelancers,
  usePostConversationsDirect,
  getGetConversationsDirectQueryKey,
  type FreelancerProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Employer-only search to start (or open) a conversation with a freelancer.
 * No default person is pre-selected — the employer must search and pick.
 */
export function FreelancerChatSearch({
  onConversationOpened,
  onSearchingChange,
}: {
  onConversationOpened: (conversationId: number) => void;
  onSearchingChange?: (searching: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const createConversation = usePostConversationsDirect();
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query.trim(), 300);
  const [startingId, setStartingId] = useState<number | null>(null);

  const isEmployer = user?.role === "employer";
  const searchEnabled = isEmployer && debouncedQuery.length >= 2;
  const showResults = query.trim().length >= 2;

  useEffect(() => {
    onSearchingChange?.(showResults);
  }, [showResults, onSearchingChange]);

  const searchQuery = useListFreelancers(
    { q: debouncedQuery, limit: 12 },
    {
      query: {
        enabled: searchEnabled,
      } as any,
    },
  );

  if (!isEmployer) return null;

  const results = searchQuery.data ?? [];

  const handleSelect = async (freelancer: FreelancerProfile) => {
    setStartingId(freelancer.id);
    try {
      const result = await createConversation.mutateAsync({
        data: { freelancerId: freelancer.id },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetConversationsDirectQueryKey({ page: 1, pageSize: 50 }),
      });
      setQuery("");
      onConversationOpened(result.conversationId);
    } catch {
      toast({
        title: "Could not start conversation",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="shrink-0 border-b border-border px-3 py-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search freelancers to message…"
          className="h-9 pl-8 pr-8 text-sm"
          autoComplete="off"
          aria-label="Search freelancers to message"
        />
        {query.length > 0 && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showResults && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-background">
          {searchQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!searchQuery.isLoading && results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No freelancers match “{debouncedQuery}”.
            </p>
          )}
          {!searchQuery.isLoading &&
            results.map((freelancer) => {
              const busy = startingId === freelancer.id;
              return (
                <button
                  key={freelancer.id}
                  type="button"
                  disabled={createConversation.isPending}
                  onClick={() => void handleSelect(freelancer)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50",
                    "disabled:opacity-60",
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">{freelancer.name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{freelancer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {freelancer.tagline || freelancer.fieldOfWork}
                    </p>
                  </div>
                  {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
