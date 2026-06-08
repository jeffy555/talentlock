// Conversation ID source: AiMatch.tsx — active conversation tracked via selectedId state.

import { useGetTokenUsageConversationId } from "@workspace/api-client-react";

interface ConversationTokenBadgeProps {
  conversationId: number;
  isActive: boolean;
  userPlan: string;
}

export default function ConversationTokenBadge({
  conversationId,
  isActive,
  userPlan,
}: ConversationTokenBadgeProps) {
  const { data } = useGetTokenUsageConversationId(conversationId, {
    query: {
      enabled: isActive && userPlan !== "employer_starter",
    } as any,
  });

  if (!isActive || userPlan === "employer_starter" || !data) return null;

  return (
    <span className="text-xs text-muted-foreground bg-slate-100 rounded px-1.5 py-0.5 ml-2 shrink-0">
      {data.totalTokens.toLocaleString()} tokens
    </span>
  );
}
