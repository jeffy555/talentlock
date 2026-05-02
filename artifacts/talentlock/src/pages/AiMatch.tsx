import { useState, useRef, useEffect } from "react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useSendOpenaiMessage,
  useDeleteOpenaiConversation,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bot, MessageSquare, Plus, Send, Trash2, User } from "lucide-react";
import { format } from "date-fns";

export default function AiMatch() {
  const { toast } = useToast();
  const { data: me } = useGetMe();
  const { data: conversations, refetch: refetchConversations } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();
  const deleteConversation = useDeleteOpenaiConversation();
  const sendMessage = useSendOpenaiMessage();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [newConvTitle, setNewConvTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: activeConversation, refetch: refetchConv } = useGetOpenaiConversation(
    selectedId!,
    { query: { enabled: selectedId !== null } as any }
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  if (me?.role !== "employer") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">AI Talent Matching</h2>
        <p className="text-muted-foreground">Only employers can access AI talent matching.</p>
      </div>
    );
  }

  const handleNewConversation = async () => {
    const title = newConvTitle.trim() || `Talent Search ${format(new Date(), "MMM d")}`;
    try {
      const conv = await createConversation.mutateAsync({ data: { title } });
      await refetchConversations();
      setSelectedId(conv.id);
      setNewConvTitle("");
    } catch {
      toast({ title: "Failed to create conversation", variant: "destructive" });
    }
  };

  const handleDeleteConversation = async (id: number) => {
    try {
      await deleteConversation.mutateAsync({ id });
      if (selectedId === id) setSelectedId(null);
      refetchConversations();
    } catch {
      toast({ title: "Failed to delete conversation", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || selectedId === null) return;
    const msg = inputMessage;
    setInputMessage("");
    try {
      await sendMessage.mutateAsync({ id: selectedId, data: { content: msg } });
      refetchConv();
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Bot className="h-8 w-8" />AI Talent Matching
        </h1>
        <p className="text-muted-foreground mt-1">Describe what you need and let AI find the right professionals from our verified talent pool.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="New search topic..."
              value={newConvTitle}
              onChange={e => setNewConvTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNewConversation()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleNewConversation} disabled={createConversation.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {!conversations || conversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Start a new talent search above</p>
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`flex items-center gap-2 p-3 rounded-md cursor-pointer group transition-all ${selectedId === conv.id ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"}`}
                  onClick={() => setSelectedId(conv.id)}
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{conv.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <Card className="md:col-span-2 flex flex-col h-full">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">AI Talent Matching</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Select an existing search or start a new one. Describe the skills, experience, and availability you need.
                </p>
              </div>
            </div>
          ) : (
            <>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base">{activeConversation?.title ?? "Loading..."}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto py-4 space-y-4">
                {!activeConversation?.messages?.length ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    <p>Describe the talent you're looking for. Try:</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li>"I need a senior React developer with 5+ years experience"</li>
                      <li>"Looking for a UX designer available this month"</li>
                      <li>"Need a Python data engineer for a 3-month project"</li>
                    </ul>
                  </div>
                ) : (
                  activeConversation.messages.map((msg: any) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      {msg.role === "user" && (
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {sendMessage.isPending && (
                  <div className="flex gap-3 justify-start">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-secondary rounded-lg px-4 py-3">
                      <div className="flex gap-1">
                        <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                        <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                        <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </CardContent>
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder="Describe the talent you need..."
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sendMessage.isPending}
                  />
                  <Button size="icon" onClick={handleSend} disabled={sendMessage.isPending || !inputMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
