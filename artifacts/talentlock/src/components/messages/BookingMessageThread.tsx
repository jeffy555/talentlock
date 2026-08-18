import { useEffect, useRef, useState } from "react";
import { usePostConversationsDirect } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { InlineMessageThread } from "./InlineMessageThread";

export function BookingMessageThread({ bookingId }: { bookingId: number }) {
  const createConversation = usePostConversationsDirect();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestedFor = useRef<number | null>(null);

  const openThread = async () => {
    setError(null);
    try {
      const result = await createConversation.mutateAsync({ data: { bookingId } });
      setConversationId(result.conversationId);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not open the booking conversation.";
      setError(message);
    }
  };

  useEffect(() => {
    if (requestedFor.current === bookingId) return;
    requestedFor.current = bookingId;
    setConversationId(null);
    void openThread();
  }, [bookingId]);

  if (error) {
    return (
      <div className="p-6 space-y-3 text-sm">
        <p className="text-destructive">{error}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={createConversation.isPending}
          onClick={() => {
            requestedFor.current = null;
            void openThread();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (conversationId == null) {
    return <div className="p-6 text-sm text-muted-foreground">Loading messages...</div>;
  }
  return <InlineMessageThread conversationId={conversationId} compact />;
}
