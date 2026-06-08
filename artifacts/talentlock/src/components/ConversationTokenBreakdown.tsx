// Conversation ID source: AiMatch.tsx — active conversation tracked via selectedId state.

import { useState } from "react";
import { Link } from "wouter";
import {
  useGetTokenUsageConversationId,
  useGetTokenUsageMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown } from "lucide-react";
import { CONVERSATION_BREAKDOWN_LAUNCH_DATE } from "@/lib/constants";
import { formatMessageTime } from "@/lib/formatMessageTime";

interface ConversationTokenBreakdownProps {
  conversationId: number;
  userPlan: string;
}

const launchDateLabel = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(CONVERSATION_BREAKDOWN_LAUNCH_DATE);

export default function ConversationTokenBreakdown({
  conversationId,
  userPlan,
}: ConversationTokenBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: monthlyUsage } = useGetTokenUsageMe({
    query: { enabled: userPlan !== "employer_starter" } as any,
  });

  const { data, isLoading, isError, refetch } = useGetTokenUsageConversationId(
    conversationId,
    {
      query: {
        enabled: userPlan !== "employer_starter" && expanded,
      } as any,
    },
  );

  if (userPlan === "employer_starter") {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="text-sm text-slate-500">
          🔒 Per-conversation breakdown — Growth plan feature
        </p>
        <Link
          href="/pricing"
          className="text-sm font-medium text-slate-700 underline mt-2 inline-block"
        >
          Upgrade to Growth →
        </Link>
      </div>
    );
  }

  const monthlyTokenLimit = monthlyUsage?.monthlyTokenLimit ?? null;
  const percentOfQuota =
    data && monthlyTokenLimit != null
      ? Math.round((data.totalTokens / monthlyTokenLimit) * 100)
      : null;

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-full"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        Token usage for this conversation
      </button>

      {expanded && (
        <div className="mt-3">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>Could not load breakdown.</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {data && !isLoading && !isError && data.legacyData && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Token breakdown is only available for conversations started after {launchDateLabel}.
            </p>
          )}

          {data && !isLoading && !isError && !data.legacyData && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Token Usage — This Conversation
              </p>
              <p className="text-sm font-medium text-slate-700 mb-1">
                Total: {data.totalTokens.toLocaleString()} tokens
                {percentOfQuota !== null && (
                  <span className="text-xs text-muted-foreground ml-2">
                    · {percentOfQuota}% of monthly quota
                  </span>
                )}
              </p>

              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-slate-100">
                    <th className="text-left pb-1 font-medium">#</th>
                    <th className="text-right pb-1 font-medium">Prompt</th>
                    <th className="text-right pb-1 font-medium">Completion</th>
                    <th className="text-right pb-1 font-medium">Total</th>
                    <th className="text-right pb-1 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.messages.map((msg, i) => (
                    <tr key={msg.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="py-1 text-slate-500">{i + 1}</td>
                      <td className="py-1 text-right text-slate-600">
                        {msg.promptTokens.toLocaleString()}
                      </td>
                      <td className="py-1 text-right text-slate-600">
                        {msg.completionTokens.toLocaleString()}
                      </td>
                      <td className="py-1 text-right font-medium text-slate-700">
                        {msg.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-1 text-right text-muted-foreground text-xs">
                        {formatMessageTime(msg.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
