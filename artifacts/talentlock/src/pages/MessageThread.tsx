import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useChatBox } from "@/components/messages/ChatBoxProvider";

/** Deep-link shim: open floating chat for :id, then return to the app shell. */
export default function MessageThread() {
  const { id } = useParams<{ id: string }>();
  const conversationId = Number(id);
  const { openConversation } = useChatBox();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (Number.isInteger(conversationId) && conversationId > 0) {
      openConversation(conversationId);
    }
    setLocation("/dashboard", { replace: true });
  }, [conversationId, openConversation, setLocation]);

  return null;
}
