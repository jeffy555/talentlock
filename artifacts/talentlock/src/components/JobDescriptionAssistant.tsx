// Integrated from: artifacts/talentlock/src/pages/PostJob.tsx
// (No shared JobForm — /jobs/:id is read-only JobDetail.tsx; edit deferred)

import { useState } from "react";
import { Link } from "wouter";
import {
  usePostAiJobDescription,
  useGetTokenUsageMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

interface JobDescriptionAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  descriptionValue: string;
  onAccept: (value: string) => void;
  jobTitle?: string;
}

type ActiveTab = "generate" | "improve" | "check";

function parseApiError(error: unknown): { status?: number; code?: string } {
  const err = error as { status?: number; data?: { code?: string }; response?: { status?: number; data?: { code?: string } } };
  return {
    status: err?.status ?? err?.response?.status,
    code: err?.data?.code ?? err?.response?.data?.code,
  };
}

export default function JobDescriptionAssistant({
  isOpen,
  onClose,
  descriptionValue,
  onAccept,
  jobTitle,
}: JobDescriptionAssistantProps) {
  const { toast } = useToast();
  const mutation = usePostAiJobDescription();
  const { data: tokenUsage } = useGetTokenUsageMe();

  const [activeTab, setActiveTab] = useState<ActiveTab>("generate");
  const [generateInput, setGenerateInput] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [assistantOutput, setAssistantOutput] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<"quota_reached" | "api_error" | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const resetOutputState = () => {
    setAssistantOutput(null);
    setScore(null);
    setMissing([]);
    setInputError(null);
    setDrawerError(null);
  };

  const resetDrawerState = () => {
    resetOutputState();
    setGenerateInput("");
    setSnapshot("");
    setActiveTab("generate");
  };

  const resetLabel = tokenUsage?.resetDate
    ? new Date(tokenUsage.resetDate).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "next month";

  const hasProtectedOutput = assistantOutput !== null || score !== null;

  const handleCloseAttempt = () => {
    if (hasProtectedOutput) {
      setShowDiscardConfirm(true);
    } else {
      resetDrawerState();
      onClose();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    handleCloseAttempt();
  };

  const handleDiscardAndClose = () => {
    setShowDiscardConfirm(false);
    resetDrawerState();
    onClose();
  };

  const handleTabChange = (tab: string) => {
    if (tab === "improve") {
      setSnapshot(descriptionValue);
    }
    setActiveTab(tab as ActiveTab);
    resetOutputState();
  };

  const handleApiError = (error: unknown) => {
    const { status, code } = parseApiError(error);
    if (status === 402 && code === "TOKEN_LIMIT") {
      setDrawerError("quota_reached");
    } else {
      setDrawerError("api_error");
    }
  };

  const handleGenerate = () => {
    if (!generateInput.trim()) {
      setInputError("Please describe the role before generating.");
      return;
    }
    setInputError(null);
    setDrawerError(null);
    mutation.mutate(
      { data: { mode: "generate", content: generateInput, jobTitle: jobTitle || undefined } },
      {
        onSuccess: (result) => {
          if (result.output) setAssistantOutput(result.output);
        },
        onError: handleApiError,
      },
    );
  };

  const handleImprove = () => {
    if (!snapshot.trim()) {
      setInputError("Your job description is empty. Add some content first.");
      return;
    }
    setInputError(null);
    setDrawerError(null);
    mutation.mutate(
      { data: { mode: "improve", content: snapshot, jobTitle: jobTitle || undefined } },
      {
        onSuccess: (result) => {
          if (result.output) setAssistantOutput(result.output);
        },
        onError: handleApiError,
      },
    );
  };

  const handleCheck = () => {
    if (!descriptionValue.trim()) return;
    setInputError(null);
    setDrawerError(null);
    mutation.mutate(
      { data: { mode: "check", content: descriptionValue, jobTitle: jobTitle || undefined } },
      {
        onSuccess: (result) => {
          setScore(result.score ?? 0);
          setMissing(result.missing ?? []);
        },
        onError: handleApiError,
      },
    );
  };

  const handleAccept = () => {
    if (!assistantOutput) return;
    onAccept(assistantOutput);
    toast({ title: "Description updated." });
    resetDrawerState();
  };

  const handleDiscardOutput = () => {
    setAssistantOutput(null);
    setDrawerError(null);
  };

  const isLoading = mutation.isPending;

  const quotaBanner = drawerError === "quota_reached" && (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-medium">⚡ Monthly AI token limit reached.</p>
      <p className="mt-1">Tokens reset on {resetLabel}.</p>
      <Link href="/pricing" className="text-sm font-medium text-amber-800 underline mt-2 inline-block">
        Upgrade Plan →
      </Link>
    </div>
  );

  const apiErrorBanner = drawerError === "api_error" && (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-2">
      <span>Could not generate description.</span>
      <Button variant="ghost" size="sm" onClick={() => setDrawerError(null)}>
        Try Again
      </Button>
    </div>
  );

  const outputActions = assistantOutput && (
    <div className="rounded-md border-l-4 border-gold bg-primary/5 p-4 space-y-3">
      <p className="text-xs font-medium text-primary">
        {activeTab === "improve" ? "Improved Version" : "AI Suggestion"}
      </p>
      <div className="text-sm text-slate-700 whitespace-pre-wrap overflow-y-auto max-h-[300px]">
        {assistantOutput}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleDiscardOutput}>
          Discard
        </Button>
        <Button
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={handleAccept}
        >
          Accept →
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-[480px] sm:max-w-full flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              Job Description Assistant
            </SheetTitle>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col mt-4">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="improve">Improve</TabsTrigger>
              <TabsTrigger value="check">Check</TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="flex-1 space-y-4 mt-0">
              <div className="space-y-2">
                <p className="text-sm font-medium">Describe the role in plain language</p>
                <Textarea
                  rows={4}
                  className="resize-none"
                  placeholder={'e.g. "I need a senior React developer to build a dashboard for our SaaS product, remote, 3 month contract, $80–100/hr"'}
                  value={generateInput}
                  onChange={(e) => {
                    setGenerateInput(e.target.value);
                    setInputError(null);
                  }}
                  disabled={isLoading}
                />
                {inputError && <p className="text-sm text-red-500">{inputError}</p>}
              </div>

              {!assistantOutput && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleGenerate} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        ✦ Generate
                      </>
                    )}
                  </Button>
                </div>
              )}

              {quotaBanner}
              {apiErrorBanner}
              {outputActions}
            </TabsContent>

            <TabsContent value="improve" className="flex-1 space-y-4 mt-0">
              {!snapshot.trim() ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Your job description is empty. Add some content to your description first, then come back to improve it.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Current description (snapshot — not live)</p>
                    <Textarea
                      rows={4}
                      className="resize-none bg-slate-50"
                      value={snapshot}
                      disabled
                      readOnly
                    />
                  </div>

                  {!assistantOutput && (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleImprove} disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            Improving...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-1" />
                            ✦ Improve
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {quotaBanner}
                  {apiErrorBanner}
                  {outputActions}
                </>
              )}
            </TabsContent>

            <TabsContent value="check" className="flex-1 space-y-4 mt-0">
              {!descriptionValue.trim() ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Your job description is empty. Add some content first.
                </p>
              ) : score === null ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Check your job post for completeness. The AI will score it and list what is missing.
                  </p>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleCheck} disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          Checking completeness...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          ✦ Check Completeness
                        </>
                      )}
                    </Button>
                  </div>
                  {quotaBanner}
                  {apiErrorBanner}
                </>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Completeness Score</p>
                  <div className="flex flex-col items-center my-4">
                    <div
                      className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-2xl font-bold ${
                        score >= 80
                          ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                          : score >= 50
                            ? "border-amber-400 text-amber-700 bg-amber-50"
                            : "border-red-400 text-red-700 bg-red-50"
                      }`}
                    >
                      {score}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-2">Missing items:</p>
                    {missing.length === 0 ? (
                      <p className="text-sm text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Great job post — nothing missing!
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {missing.map((item, i) => (
                          <li key={i} className="text-sm text-amber-700 flex items-start gap-1">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setScore(null);
                        setMissing([]);
                        setDrawerError(null);
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      ↺ Check Again
                    </Button>
                  </div>

                  {quotaBanner}
                  {apiErrorBanner}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard AI output?</AlertDialogTitle>
            <AlertDialogDescription>
              Your generated content will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDiscardAndClose}
            >
              Discard & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
