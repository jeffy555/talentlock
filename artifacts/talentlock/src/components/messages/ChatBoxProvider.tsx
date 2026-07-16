import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ChatBoxContextValue = {
  isOpen: boolean;
  selectedId: number | null;
  openInbox: () => void;
  openConversation: (conversationId: number) => void;
  selectConversation: (conversationId: number | null) => void;
  close: () => void;
  toggle: () => void;
};

const ChatBoxContext = createContext<ChatBoxContextValue | null>(null);

export function ChatBoxProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const openInbox = useCallback(() => {
    setSelectedId(null);
    setIsOpen(true);
  }, []);

  const openConversation = useCallback((conversationId: number) => {
    setSelectedId(conversationId);
    setIsOpen(true);
  }, []);

  const selectConversation = useCallback((conversationId: number | null) => {
    setSelectedId(conversationId);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((open) => {
      if (open) return false;
      return true;
    });
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      selectedId,
      openInbox,
      openConversation,
      selectConversation,
      close,
      toggle,
    }),
    [isOpen, selectedId, openInbox, openConversation, selectConversation, close, toggle],
  );

  return <ChatBoxContext.Provider value={value}>{children}</ChatBoxContext.Provider>;
}

export function useChatBox() {
  const ctx = useContext(ChatBoxContext);
  if (!ctx) {
    throw new Error("useChatBox must be used within ChatBoxProvider");
  }
  return ctx;
}
