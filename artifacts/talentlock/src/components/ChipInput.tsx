import { useState, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxChips?: number;
  className?: string;
}

export default function ChipInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  maxChips = 20,
  className,
}: ChipInputProps) {
  const [input, setInput] = useState("");

  const addChip = (raw: string) => {
    const chip = raw.trim();
    if (!chip || value.includes(chip) || value.length >= maxChips) return;
    onChange([...value, chip]);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((chip) => (
            <Badge key={chip} variant="secondary" className="gap-1 pr-1">
              {chip}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== chip))}
                className="rounded-full hover:bg-muted p-0.5"
                aria-label={`Remove ${chip}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addChip(input)}
        placeholder={placeholder}
        disabled={value.length >= maxChips}
      />
    </div>
  );
}
