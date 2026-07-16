import { useEffect } from "react";
import { useLocation } from "wouter";
import { useChatBox } from "@/components/messages/ChatBoxProvider";

/** Deep-link shim: open floating inbox, then return to the app shell. */
export default function MessagesInbox() {
  const { openInbox } = useChatBox();
  const [, setLocation] = useLocation();

  useEffect(() => {
    openInbox();
    setLocation("/dashboard", { replace: true });
  }, [openInbox, setLocation]);

  return null;
}
