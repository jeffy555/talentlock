import { useState, useRef, useEffect } from "react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useSendOpenaiMessage,
  useDeleteOpenaiConversation,
  useGetMe,
  useGetFreelancerProfile,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, MessageSquare, Plus, Send, Trash2, User,
  Mail, ExternalLink, Calendar, BadgeCheck, Lock,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

function parseFreelancerIds(text: string): number[] {
  const matches = text.matchAll(/(?:freelancer\s+)?id[:\s#]+(\d+)/gi);
  const ids = new Set<number>();
  for (const m of matches) {
    const n = parseInt(m[1]);
    if (!isNaN(n)) ids.add(n);
  }
  return [...ids];
}

function FreelancerContactCard({ freelancerId }: { freelancerId: number }) {
  const { data: freelancer, isLoading } = useGetFreelancerProfile(freelancerId, {
    query: { enabled: true } as any,
  });

  if (isLoading) {
    return (
      <div className="border rounded-lg p-3 bg-background animate-pulse h-24" />
    );
  }
  if (!freelancer) return null;

  const f = freelancer as typeof freelancer & { email?: string | null };
  const initials = f.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const rate = f.paymentPreference === "hourly" && f.hourlyRate
    ? `$${f.hourlyRate}/hr`
    : f.paymentPreference === "daily" && f.dailyRate
    ? `$${f.dailyRate}/day`
    : null;

  const isDemo = f.email?.endsWith("@demo.talentlock.io");

  return (
    <div className="border rounded-xl bg-background shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{f.name}</span>
            {f.isVerified && <BadgeCheck className="h-4 w-4 text-primary" />}
            {f.isAvailable
              ? <Badge className="bg-green-600 text-white text-xs py-0">Available</Badge>
              : <Badge variant="destructive" className="text-xs py-0 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />Booked</Badge>
            }
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{f.tagline}</p>
          {rate && <p className="text-xs font-medium text-primary mt-1">{rate}</p>}
        </div>
      </div>

      {f.skills.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {f.skills.slice(0, 5).map((skill: string, i: number) => (
            <Badge key={i} variant="outline" className="text-xs py-0">{skill}</Badge>
          ))}
          {f.skills.length > 5 && (
            <Badge variant="outline" className="text-xs py-0 text-muted-foreground">+{f.skills.length - 5} more</Badge>
          )}
        </div>
      )}

      <div className="border-t px-4 py-3 space-y-2">
        {f.email && !isDemo && (
          <a
            href={`mailto:${f.email}`}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{f.email}</span>
          </a>
        )}
        {f.portfolioUrl && (
          <a
            href={f.portfolioUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">Portfolio</span>
          </a>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 text-xs h-7" asChild>
            <Link href={`/freelancers/${f.id}`}>View Profile</Link>
          </Button>
          {f.isAvailable && (
            <Button size="sm" className="flex-1 text-xs h-7" asChild>
              <Link href={`/freelancers/${f.id}`}>
                <Calendar className="h-3 w-3 mr-1" />Book Now
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AiMessageBubble({ msg }: { msg: any }) {
  const ids = msg.role === "assistant" ? parseFreelancerIds(msg.content) : [];

  return (
    <div className="space-y-3">
      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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

      {ids.length > 0 && (
        <div className="ml-11">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Matched candidates — click to contact or book:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ids.map(id => (
              <FreelancerContactCard key={id} freelancerId={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
              <CardContent className="flex-1 overflow-y-auto py-4 space-y-6">
                {!activeConversation?.messages?.length ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    <p>Describe the talent you're looking for. Try:</p>
                    <ul className="mt-2 space-y-1 text-xs">
                      <li>"I need a senior React developer with 5+ years experience"</li>
                      <li>"Looking for a UX designer available this month"</li>
                      <li>"Need a DevOps engineer with 10+ years experience"</li>
                    </ul>
                  </div>
                ) : (
                  activeConversation.messages.map((msg: any) => (
                    <AiMessageBubble key={msg.id} msg={msg} />
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
