import { useState } from "react";
import { usePostAiProposal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, Copy } from "lucide-react";

type ProposalTone = "professional" | "friendly" | "concise";

interface ProposalGeneratorDrawerProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (proposal: string) => void;
}

function parseApiError(error: unknown): { status?: number; code?: string } {
  const err = error as {
    status?: number;
    data?: { code?: string };
    response?: { status?: number; data?: { code?: string } };
  };
  return {
    status: err?.status ?? err?.response?.status,
    code: err?.data?.code ?? err?.response?.data?.code,
  };
}

export function AcceptedProposalBlock({ proposal }: { proposal: string }) {
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(proposal);
      toast({ title: "Copied to clipboard." });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 p-4">
      <p className="text-xs font-semibold text-violet-700 mb-2">✦ Your AI-generated proposal</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{proposal}</p>
      <div className="flex justify-end mt-3">
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-1" />
          Copy text
        </Button>
      </div>
    </div>
  );
}

export default function ProposalGeneratorDrawer({
  bookingId,
  isOpen,
  onClose,
  onAccept,
}: ProposalGeneratorDrawerProps) {
  const mutation = usePostAiProposal();
  const [tone, setTone] = useState<ProposalTone>("professional");
  const [proposalOutput, setProposalOutput] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const resetOutput = () => {
    setProposalOutput(null);
    setApiError(null);
  };

  const handleClose = () => {
    resetOutput();
    onClose();
  };

  const handleGenerate = () => {
    setApiError(null);
    mutation.mutate(
      { data: { bookingId, tone } },
      {
        onSuccess: (result) => {
          if (result.error) {
            setApiError(result.error);
            setProposalOutput(null);
            return;
          }
          if (result.proposal) {
            setProposalOutput(result.proposal);
          } else {
            setApiError("Could not generate proposal. Please try again.");
          }
        },
        onError: (error) => {
          const { status, code } = parseApiError(error);
          if (status === 402 && code === "TOKEN_LIMIT") {
            setApiError("Monthly AI token limit reached. Try again after your tokens reset.");
          } else {
            setApiError("Could not generate proposal. Please try again.");
          }
        },
      },
    );
  };

  const handleAccept = () => {
    if (!proposalOutput) return;
    onAccept(proposalOutput);
    resetOutput();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-full flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Write Proposal
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tone</Label>
            <RadioGroup
              value={tone}
              onValueChange={(v) => setTone(v as ProposalTone)}
              className="flex flex-wrap gap-4"
              disabled={mutation.isPending}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="professional" id="tone-professional" />
                <Label htmlFor="tone-professional" className="font-normal cursor-pointer">Professional</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="friendly" id="tone-friendly" />
                <Label htmlFor="tone-friendly" className="font-normal cursor-pointer">Friendly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="concise" id="tone-concise" />
                <Label htmlFor="tone-concise" className="font-normal cursor-pointer">Concise</Label>
              </div>
            </RadioGroup>
          </div>

          {!proposalOutput && !apiError && (
            <p className="text-sm text-muted-foreground">
              Generate a personalised proposal for this booking based on your profile and the job requirements.
            </p>
          )}

          {mutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing your proposal...
            </div>
          )}

          {apiError && !mutation.isPending && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{apiError}</p>
              <Button variant="ghost" size="sm" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          )}

          {proposalOutput && !mutation.isPending && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Your Proposal</Label>
              <div className="rounded border-l-4 border-violet-400 bg-violet-50 p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {proposalOutput}
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={handleGenerate}>
                  Regenerate
                </Button>
                <Button variant="ghost" size="sm" onClick={resetOutput}>
                  Discard
                </Button>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={handleAccept}
                >
                  Accept Proposal
                </Button>
              </div>
            </div>
          )}
        </div>

        {!proposalOutput && !mutation.isPending && (
          <div className="pt-4 border-t">
            <Button className="w-full gap-2" onClick={handleGenerate} disabled={mutation.isPending}>
              <Sparkles className="h-4 w-4" />
              Generate Proposal
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
