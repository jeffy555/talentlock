import { useRef, useState } from "react";
import { useSession } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, Sparkles, Upload, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";

export interface ParsedResume {
  tagline: string;
  fieldOfWork: string;
  skills: string[];
  yearsExperience: number;
  paymentPreference: "hourly" | "daily";
  hourlyRate: number | null;
  bio: string;
}

interface ResumeImporterProps {
  onParsed: (data: ParsedResume) => void;
  compact?: boolean;
}

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeImporter({ onParsed, compact = false }: ResumeImporterProps) {
  const { session } = useSession();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function parseFile(f: File) {
    setFile(f);
    setParsing(true);
    try {
      const token = await session?.getToken();
      const body = new FormData();
      body.append("resume", f);
      const res = await fetch(`${BASE}api/freelancers/parse-resume`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Resume parsing failed.");
      }
      onParsed(json as ParsedResume);
      toast({
        title: "Resume imported!",
        description: "Your profile fields have been filled in. Review and adjust before saving.",
      });
    } catch (err: any) {
      toast({
        title: "Could not import resume",
        description: err?.message ?? "Please upload a valid PDF or DOCX resume.",
        variant: "destructive",
      });
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    parseFile(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-dashed"
          disabled={parsing}
          onClick={() => inputRef.current?.click()}
        >
          {parsing ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Parsing…</>
          ) : (
            <><Sparkles className="h-4 w-4 text-[#c9a84c]" />Import from Resume</>
          )}
        </Button>
        {file && !parsing && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />{file.name}
            <button
              type="button"
              onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !parsing && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-5 transition-colors cursor-pointer select-none
          ${dragging ? "border-[#c9a84c] bg-[#c9a84c]/5" : "border-border hover:border-primary/40 hover:bg-secondary/30"}
          ${parsing ? "pointer-events-none opacity-80" : ""}`}
      >
        {parsing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">AI is reading your resume…</p>
            <p className="text-xs text-muted-foreground">This takes a few seconds</p>
          </>
        ) : file ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)} · Click to change</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <Sparkles className="h-5 w-5 text-[#c9a84c]" />
            </div>
            <p className="text-sm font-medium text-foreground text-center">
              Drop your resume here, or <span className="text-primary underline underline-offset-2">browse</span>
            </p>
            <p className="text-xs text-muted-foreground text-center">
              PDF, DOCX, or TXT · max 10 MB · AI will fill your profile automatically
            </p>
          </>
        )}
      </div>
    </div>
  );
}
