import { useState } from "react";
import { usePatchWatchlistNotes, getListSavedFreelancersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface WatchlistNotesEditorProps {
  freelancerId: number;
  initialNotes?: string | null;
}

export function WatchlistNotesEditor({ freelancerId, initialNotes }: WatchlistNotesEditorProps) {
  const qc = useQueryClient();
  const patchNotes = usePatchWatchlistNotes();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const notes = initialNotes ?? "";

  const handleSave = async () => {
    setError(null);
    try {
      await patchNotes.mutateAsync({ id: freelancerId, data: { notes: draft || null } });
      qc.invalidateQueries({ queryKey: getListSavedFreelancersQueryKey() });
      setExpanded(false);
    } catch {
      setError("Could not save note. Try again.");
    }
  };

  const handleCancel = () => {
    setDraft(notes);
    setError(null);
    setExpanded(false);
  };

  if (!expanded) {
    const preview = notes.trim();
    return (
      <div className="px-6 pb-4 -mt-2">
        {preview ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-left text-sm text-muted-foreground hover:text-foreground w-full"
          >
            <span className="line-clamp-2">{preview}</span>
            <span className="text-xs text-primary mt-1 inline-block">Edit note</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-sm text-primary hover:underline"
          >
            Add a private note
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 pb-4 -mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">Private note (only visible to you)</p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 500))}
        rows={3}
        aria-label="Private watchlist note"
        className="text-sm resize-none"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {draft.length}/500
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={patchNotes.isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={patchNotes.isPending}>
            {patchNotes.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
