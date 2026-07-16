import { useEffect, useRef, useState } from "react";
import { usePostConversationsDirect } from "@workspace/api-client-react";
import { InlineMessageThread } from "./InlineMessageThread";

export function MeetingMessageThread({ meetingId }: { meetingId: number }) {
  const createConversation = usePostConversationsDirect();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    createConversation.mutateAsync({ data: { meetingId } })
      .then((result) => setConversationId(result.conversationId))
      .catch(() => undefined);
  }, [meetingId]);

  if (conversationId == null) {
    return <div className="p-6 text-sm text-muted-foreground">Loading messages...</div>;
  }
  return <InlineMessageThread conversationId={conversationId} compact />;
}
