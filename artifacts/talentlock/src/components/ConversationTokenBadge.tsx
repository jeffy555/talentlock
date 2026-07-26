// Conversation ID source: AiMatch.tsx — active conversation tracked via selectedId state.

import { useGetTokenUsageConversationId } from "@workspace/api-client-react";
import { hasEmployerGrowthFeatures } from "@/lib/planAccess";

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
  const canView = hasEmployerGrowthFeatures(userPlan);
  const { data } = useGetTokenUsageConversationId(conversationId, {
    query: {
      enabled: isActive && canView,
    } as any,
  });

  if (!isActive || !canView || !data) return null;

  return (
    <span className="text-xs text-muted-foreground bg-slate-100 rounded px-1.5 py-0.5 ml-2 shrink-0">
      {data.totalTokens.toLocaleString()} tokens
    </span>
  );
}
