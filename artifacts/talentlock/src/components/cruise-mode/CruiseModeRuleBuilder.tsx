import { useRef, useState } from "react";
import {
  useParseCruiseModeRules,
  type CruiseModeRules,
  type ParseCruiseModeRulesResult,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Rocket, Sparkles, Upload, X } from "lucide-react";
import { emptyCruiseModeRules } from "@/lib/cruiseModeDisplayUtils";

interface CruiseModeRuleBuilderProps {
  initialRules?: CruiseModeRules | null;
  initialRawText?: string | null;
  onSave: (rules: CruiseModeRules, rawRulesText?: string | null) => Promise<void>;
  isSaving: boolean;
}

function TagListEditor({
  label,
  description,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) return;
    onChange([...values, trimmed]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-primary/5 text-primary border border-primary/20 px-2.5 py-1 text-xs"
          >
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label="Add">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ParsedPreview({
  result,
  onUse,
  onEdit,
}: {
  result: ParseCruiseModeRulesResult;
  onUse: () => void;
  onEdit: () => void;
}) {
  const { rules, warnings } = result;
  const items = [
    rules.requiredSkills.length > 0 && `Required skills: ${rules.requiredSkills.join(", ")}`,
    rules.minRate != null || rules.maxRate != null
      ? `Rate range: $${rules.minRate ?? "—"} – $${rules.maxRate ?? "—"}/hr`
      : null,
    rules.excludedKeywords.length > 0 && `Excluded keywords: ${rules.excludedKeywords.join(", ")}`,
    rules.maxDurationWeeks != null && `Max duration: ${rules.maxDurationWeeks} weeks`,
    rules.availableFrom && `Available from: ${rules.availableFrom}`,
  ].filter(Boolean) as string[];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">AI parsed your rules</CardTitle>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={onUse}>
            Use
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm flex items-center gap-2 text-emerald-700">
            ✅ {item}
          </p>
        ))}
        {warnings.map((w) => (
          <p key={w} className="text-sm flex items-center gap-2 text-amber-700">
            ⚠ {w}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export function CruiseModeRuleBuilder({
  initialRules,
  initialRawText,
  onSave,
  isSaving,
}: CruiseModeRuleBuilderProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"onboarding" | "form" | "parser">(
    initialRules ? "form" : "onboarding",
  );
  const [rules, setRules] = useState<CruiseModeRules>(initialRules ?? emptyCruiseModeRules());
  const [rawText, setRawText] = useState(initialRawText ?? "");
  const [parsePreview, setParsePreview] = useState<ParseCruiseModeRulesResult | null>(null);

  const parseRules = useParseCruiseModeRules();

  const updateRules = (patch: Partial<CruiseModeRules>) => {
    setRules((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    try {
      await onSave(rules, rawText || null);
      toast({ title: "Rules saved", description: "Your Cruise Mode rules have been updated." });
      if (mode === "onboarding") setMode("form");
    } catch {
      toast({ title: "Error", description: "Could not save rules.", variant: "destructive" });
    }
  };

  const handleParse = () => {
    if (!rawText.trim()) {
      toast({ title: "Enter rules text", variant: "destructive" });
      return;
    }
    parseRules.mutate(
      { data: { rawText: rawText.trim() } },
      {
        onSuccess: (result) => setParsePreview(result),
        onError: () => toast({ title: "Parse failed", description: "Could not parse rules.", variant: "destructive" }),
      },
    );
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setRawText(String(reader.result ?? ""));
      setMode("parser");
    };
    reader.readAsText(file);
  };

  if (mode === "onboarding") {
    return (
      <Card className="border-dashed border-primary/20 bg-primary/5">
        <CardContent className="pt-8 pb-8 space-y-4 text-center max-w-lg mx-auto">
          <Rocket className="h-10 w-10 text-primary mx-auto" />
          <h2 className="text-xl font-semibold text-slate-800">Set up Cruise Mode</h2>
          <p className="text-sm text-muted-foreground">
            Define your rules once. Your AI assistant will automatically express interest in matching jobs while
            you&apos;re away.
          </p>
          <ul className="text-sm text-left text-muted-foreground space-y-1 max-w-xs mx-auto">
            <li>○ Build rules with a form</li>
            <li>○ Paste or upload a rules file (.txt or .md)</li>
          </ul>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setMode("form")}>
              Get started →
            </Button>
            <Button variant="outline" onClick={() => setMode("parser")}>
              Paste rules text
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mode === "parser") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Paste your rules or upload a .txt / .md file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="I want React and TypeScript projects, $80-$120/hr, no crypto or gambling..."
            />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload .txt / .md
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={handleParse}
                disabled={parseRules.isPending}
              >
                {parseRules.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                ✦ Parse with AI
              </Button>
              <Button variant="ghost" onClick={() => setMode("form")}>
                Use form instead
              </Button>
            </div>
          </CardContent>
        </Card>

        {parsePreview && (
          <ParsedPreview
            result={parsePreview}
            onEdit={() => {
              setParsePreview(null);
              setMode("form");
            }}
            onUse={() => {
              setRules(parsePreview.rules);
              setParsePreview(null);
              setMode("form");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg">Your Cruise Mode Rules</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode("parser")}>
            Paste / parse text
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save rules
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <TagListEditor
          label="Required skills"
          description="AI will only respond to jobs with at least one of these skills"
          values={rules.requiredSkills}
          onChange={(requiredSkills) => updateRules({ requiredSkills })}
          placeholder="e.g. React"
        />

        <TagListEditor
          label="Preferred skills (bonus match points)"
          values={rules.preferredSkills}
          onChange={(preferredSkills) => updateRules({ preferredSkills })}
          placeholder="e.g. Node.js"
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Hourly rate range — From ($/hr)</Label>
            <Input
              type="number"
              min={0}
              value={rules.minRate ?? ""}
              onChange={(e) =>
                updateRules({ minRate: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="80"
            />
          </div>
          <div className="space-y-2">
            <Label>To ($/hr)</Label>
            <Input
              type="number"
              min={0}
              value={rules.maxRate ?? ""}
              onChange={(e) =>
                updateRules({ maxRate: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="120"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Project duration — Min (weeks)</Label>
            <Input
              type="number"
              min={0}
              value={rules.minDurationWeeks ?? ""}
              onChange={(e) =>
                updateRules({ minDurationWeeks: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max (weeks)</Label>
            <Input
              type="number"
              min={0}
              value={rules.maxDurationWeeks ?? ""}
              onChange={(e) =>
                updateRules({ maxDurationWeeks: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        </div>

        <TagListEditor
          label="Excluded keywords"
          description="Never respond to jobs mentioning these"
          values={rules.excludedKeywords}
          onChange={(excludedKeywords) => updateRules({ excludedKeywords })}
          placeholder="e.g. crypto"
        />

        <div className="space-y-3">
          <Label>Match threshold (only respond if match score ≥ this)</Label>
          <div className="flex items-center gap-4">
            <Slider
              min={50}
              max={90}
              step={5}
              value={[rules.matchThreshold]}
              onValueChange={([matchThreshold]) => updateRules({ matchThreshold })}
              className="flex-1"
            />
            <span className="text-sm font-semibold w-16 text-right">{rules.matchThreshold} / 100</span>
          </div>
          <p className="text-xs text-muted-foreground">Conservative (90) ← → Aggressive (50)</p>
        </div>

        <div className="space-y-2">
          <Label>Message tone</Label>
          <RadioGroup
            value={rules.messageTone}
            onValueChange={(messageTone) =>
              updateRules({ messageTone: messageTone as CruiseModeRules["messageTone"] })
            }
            className="flex flex-wrap gap-4"
          >
            {(["professional", "friendly", "concise"] as const).map((tone) => (
              <div key={tone} className="flex items-center space-x-2">
                <RadioGroupItem value={tone} id={`tone-${tone}`} />
                <Label htmlFor={`tone-${tone}`} className="capitalize font-normal cursor-pointer">
                  {tone}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>Blackout windows — timezone</Label>
          <Input
            value={rules.blackoutWindows?.timezone ?? ""}
            onChange={(e) =>
              updateRules({
                blackoutWindows: e.target.value
                  ? {
                      timezone: e.target.value,
                      windows: rules.blackoutWindows?.windows ?? [],
                    }
                  : null,
              })
            }
            placeholder="e.g. America/New_York"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label>Daily digest notifications</Label>
            <p className="text-xs text-muted-foreground">Batch into one daily summary</p>
          </div>
          <Switch
            checked={rules.dailyDigest}
            onCheckedChange={(dailyDigest) => updateRules({ dailyDigest })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
