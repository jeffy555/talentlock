import { useState, useRef, useEffect } from "react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useSendOpenaiMessage,
  useDeleteOpenaiConversation,
  useGetMe,
  useGetMyEmployerProfile,
  useGetFreelancerProfile,
  useGetTokenUsageMe,
  useListJobRequirements,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, MessageSquare, Plus, Send, Trash2, User,
  Mail, ExternalLink, Calendar, BadgeCheck, Lock, Sparkles,
} from "lucide-react";
import { resolveVerificationLevel, isVerifiedLevel } from "@/lib/verification";
import { format } from "date-fns";
import { Link, useLocation, useSearch } from "wouter";
import { TokenUsageBanner } from "@/components/TokenUsageBanner";
import ConversationTokenBadge from "@/components/ConversationTokenBadge";
import ConversationTokenBreakdown from "@/components/ConversationTokenBreakdown";
import MatchExplanationCard from "@/components/MatchExplanationCard";
import {
  freelancerProfileHref,
  parseJobIdFromSearch,
  persistJobId,
  readPersistedJobId,
  resolveActiveJobId,
} from "@/lib/aiMatchJobContext";
import { formatRate, profileDefaultRateType } from "@/lib/rateFormatUtils";

type Match = { id: number; score?: number; reason?: string };
type Recommendation = { freelancerId: string; name: string };

const MATCH_MARKER_RE = /\[MATCH:(\d+)\|SCORE:(\d+)\|REASON:([^\]]+)\]/g;

function parseMatches(text: string): Match[] {
  const map = new Map<number, Match>();

  // Preferred: structured markers from the model
  for (const m of text.matchAll(MATCH_MARKER_RE)) {
    const id = parseInt(m[1]);
    if (isNaN(id)) continue;
    const rawScore = parseInt(m[2]);
    const score = isNaN(rawScore) ? undefined : Math.max(0, Math.min(100, rawScore));
    const reason = m[3].trim();
    map.set(id, { id, score, reason });
  }

  // Always also collect any "id: N" mentions in case the model partially complied
  // — this preserves recommendations whose markers were malformed.
  for (const m of text.matchAll(/(?:freelancer\s+)?id[:\s#]+(\d+)/gi)) {
    const n = parseInt(m[1]);
    if (!isNaN(n) && !map.has(n)) map.set(n, { id: n });
  }

  return [...map.values()];
}

function stripMatchMarkers(text: string): string {
  return text.replace(MATCH_MARKER_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseChatResponse(rawContent: string): {
  message: string;
  recommendations: Recommendation[];
  isStructuredJson: boolean;
} {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.message && Array.isArray(parsed.recommendations)) {
      return {
        message: parsed.message,
        recommendations: parsed.recommendations.map((rec: { freelancerId: string | number; name: string }) => ({
          freelancerId: String(rec.freelancerId),
          name: rec.name,
        })),
        isStructuredJson: true,
      };
    }
  } catch {
    // Legacy format or non-JSON response
  }
  return { message: rawContent, recommendations: [], isStructuredJson: false };
}

function scoreColor(score?: number): string {
  if (score === undefined) return "bg-secondary text-secondary-foreground border-border";
  if (score >= 90) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 70) return "bg-blue-100 text-blue-800 border-blue-200";
  if (score >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent match";
  if (score >= 70) return "Strong match";
  if (score >= 50) return "Partial match";
  return "Weak match";
}

function FreelancerContactCard({
  match,
  jobRequirementId,
}: {
  match: Match;
  jobRequirementId?: number | null;
}) {
  const { data: freelancer, isLoading } = useGetFreelancerProfile(match.id, {
    query: { enabled: true } as any,
  });

  if (isLoading) {
    return (
      <div className="border rounded-xl bg-background shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="h-11 w-11 rounded-full bg-muted animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-3 w-full bg-muted rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="px-4 pb-3 flex gap-1">
          <div className="h-5 w-14 bg-muted rounded animate-pulse" />
          <div className="h-5 w-16 bg-muted rounded animate-pulse" />
          <div className="h-5 w-12 bg-muted rounded animate-pulse" />
        </div>
        <div className="border-t px-4 py-3">
          <div className="h-7 w-full bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }
  if (!freelancer) return null;

  const profileJobId = jobRequirementId ?? readPersistedJobId();
  const f = freelancer as typeof freelancer & { email?: string | null };
  const initials = f.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const rate = f.paymentPreference === "hourly" && f.hourlyRate != null
    ? formatRate(Number(f.hourlyRate), profileDefaultRateType(f.professionCategory), f.currencyCode ?? "USD")
    : f.paymentPreference === "daily" && f.dailyRate != null
    ? formatRate(Number(f.dailyRate), "per_day", f.currencyCode ?? "USD")
    : null;

  const isDemo = f.email?.endsWith("@demo.talentlock.io");

  return (
    <div className="border rounded-xl bg-background shadow-sm overflow-hidden">
      {match.score !== undefined && (
        <div className={`flex items-center justify-between gap-2 px-4 py-2 border-b text-xs ${scoreColor(match.score)}`}>
          <span className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            {scoreLabel(match.score)}
          </span>
          <span className="font-bold tabular-nums">{match.score}%</span>
        </div>
      )}
      <div className="flex items-start gap-3 p-4">
        <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{f.name}</span>
            {isVerifiedLevel(resolveVerificationLevel(f as { verificationLevel?: string; isVerified?: boolean })) && (
              <BadgeCheck className="h-4 w-4 text-primary" />
            )}
            {f.isAvailable
              ? <Badge className="bg-green-600 text-white text-xs py-0">Available</Badge>
              : <Badge variant="destructive" className="text-xs py-0 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />Booked</Badge>
            }
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{f.tagline}</p>
          {rate && <p className="text-xs font-medium text-primary mt-1">{rate}</p>}
          {match.reason && (
            <p className="text-xs text-foreground/80 mt-2 italic leading-snug border-l-2 border-primary/30 pl-2">
              "{match.reason}"
            </p>
          )}
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
            <Link href={freelancerProfileHref(f.id, profileJobId)}>View Profile</Link>
          </Button>
          {f.isAvailable && (
            <Button size="sm" className="flex-1 text-xs h-7" asChild>
              <Link href={freelancerProfileHref(f.id, profileJobId)}>
                <Calendar className="h-3 w-3 mr-1" />Book Now
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AiMessageBubble({
  msg,
  conversationId,
  activeJobId,
}: {
  msg: any;
  conversationId: number;
  activeJobId?: number;
}) {
  const effectiveJobId = activeJobId ?? null;
  const isAssistant = msg.role === "assistant";
  const parsed = isAssistant ? parseChatResponse(msg.content) : null;
  const jsonRecommendations = parsed && parsed.recommendations.length > 0
    ? parsed.recommendations.slice(0, 3)
    : [];
  const legacyMatches = isAssistant && jsonRecommendations.length === 0
    ? parseMatches(msg.content)
    : [];
  const displayContent = isAssistant
    ? (parsed!.isStructuredJson ? parsed!.message : stripMatchMarkers(msg.content))
    : msg.content;

  return (
    <div className="space-y-3">
      <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
        {msg.role === "assistant" && (
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
          <p className="whitespace-pre-wrap leading-relaxed">{displayContent}</p>
        </div>
        {msg.role === "user" && (
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {jsonRecommendations.length > 0 && (
        <div className="ml-11 min-w-0 space-y-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            {jsonRecommendations.length} matched {jsonRecommendations.length === 1 ? "candidate" : "candidates"}:
          </p>
          {jsonRecommendations.map(rec => (
            <div key={rec.freelancerId}>
              <FreelancerContactCard
                match={{ id: parseInt(rec.freelancerId, 10) }}
                jobRequirementId={effectiveJobId}
              />
              <MatchExplanationCard
                freelancerId={rec.freelancerId}
                jobRequirementId={effectiveJobId != null ? String(effectiveJobId) : undefined}
                conversationId={String(conversationId)}
              />
            </div>
          ))}
        </div>
      )}

      {legacyMatches.length > 0 && (
        <div className="ml-11 min-w-0">
          <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            {legacyMatches.length} matched {legacyMatches.length === 1 ? "candidate" : "candidates"} — sorted by fit:
          </p>
          <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 min-w-0">
            {[...legacyMatches].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(m => (
              <FreelancerContactCard key={m.id} match={m} jobRequirementId={effectiveJobId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiMatch() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const urlJobRequirementId = parseJobIdFromSearch(search);
  const { data: me } = useGetMe();
  const { data: myEmployerProfile } = useGetMyEmployerProfile({
    query: { enabled: me?.role === "employer" } as any,
  });
  const { data: employerJobs } = useListJobRequirements(
    myEmployerProfile ? { employerId: myEmployerProfile.id, status: "open" } : undefined,
    { query: { enabled: me?.role === "employer" && !!myEmployerProfile?.id } as any },
  );
  const latestOpenJobId = employerJobs?.length
    ? [...employerJobs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0]?.id
    : undefined;
  const { data: tokenUsage } = useGetTokenUsageMe({
    query: { enabled: me?.role === "employer" } as any,
  });
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

  const activeJobId = resolveActiveJobId(
    activeConversation?.jobRequirementId,
    urlJobRequirementId,
    latestOpenJobId,
  );

  useEffect(() => {
    if (activeJobId) persistJobId(activeJobId);
  }, [activeJobId]);

  useEffect(() => {
    if (urlJobRequirementId) persistJobId(urlJobRequirementId);
  }, [urlJobRequirementId]);

  useEffect(() => {
    if (activeConversation?.jobRequirementId != null) {
      persistJobId(activeConversation.jobRequirementId);
    }
  }, [activeConversation?.jobRequirementId]);

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

  const monthlyTokenLimit = tokenUsage?.monthlyTokenLimit ?? null;
  const tokensUsed = tokenUsage?.tokensUsed ?? 0;
  const isAtLimit = !!monthlyTokenLimit && tokensUsed >= monthlyTokenLimit;
  const resetLabel = tokenUsage?.resetDate
    ? new Date(tokenUsage.resetDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleTokenLimitError = (error: any) => {
    const body = error?.body ?? error?.data ?? error?.response?.data;
    if (error?.status === 402 && body?.code === "TOKEN_LIMIT") {
      setLocation("/pricing");
      return true;
    }
    return false;
  };

  const handleNewConversation = async () => {
    const title = newConvTitle.trim() || `Talent Search ${format(new Date(), "MMM d")}`;
    try {
      const conv = await createConversation.mutateAsync({
        data: {
          title,
          ...(activeJobId ? { jobRequirementId: activeJobId } : {}),
        },
      });
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
    if (!inputMessage.trim() || selectedId === null || isAtLimit) return;
    const msg = inputMessage;
    setInputMessage("");
    try {
      await sendMessage.mutateAsync({ id: selectedId, data: { content: msg } });
      refetchConv();
    } catch (error: any) {
      if (handleTokenLimitError(error)) return;
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
      <TokenUsageBanner />

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
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-sm font-medium flex-1 truncate">{conv.title}</span>
                    <ConversationTokenBadge
                      conversationId={conv.id}
                      isActive={selectedId === conv.id}
                      userPlan={tokenUsage?.plan ?? "employer_starter"}
                    />
                  </div>
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
                    <AiMessageBubble
                      key={msg.id}
                      msg={msg}
                      conversationId={selectedId!}
                      activeJobId={activeJobId}
                    />
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
              <div className="px-4 pb-2">
                <ConversationTokenBreakdown
                  conversationId={selectedId}
                  userPlan={tokenUsage?.plan ?? "employer_starter"}
                />
              </div>
              <div className="p-4 border-t space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Describe the talent you need..."
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sendMessage.isPending || isAtLimit}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={sendMessage.isPending || !inputMessage.trim() || isAtLimit}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {isAtLimit && resetLabel && (
                  <p className="text-sm text-muted-foreground">
                    Your monthly AI token limit has been reached. Tokens reset on {resetLabel}.{" "}
                    <Link href="/pricing" className="text-primary underline-offset-4 hover:underline">
                      Upgrade your plan →
                    </Link>
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
