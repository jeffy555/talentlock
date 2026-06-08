import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  getModifierDays,
  type AvailabilityBlockLike,
} from "@/lib/availabilityUtils";

interface AvailabilityCalendarGridProps {
  blocks: AvailabilityBlockLike[];
  interactive?: boolean;
  onDayClick?: (date: Date) => void;
}

export function AvailabilityCalendarGrid({
  blocks,
  interactive = false,
  onDayClick,
}: AvailabilityCalendarGridProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded hover:bg-secondary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium">{format(currentMonth, "MMMM yyyy")}</p>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded hover:bg-secondary transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Calendar
        mode="single"
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        showOutsideDays={false}
        classNames={{ nav: "hidden" }}
        modifiers={{
          booked: getModifierDays(blocks, "booked"),
          holiday: getModifierDays(blocks, "holiday"),
          unavailable: getModifierDays(blocks, "unavailable"),
        }}
        modifiersClassNames={{
          booked: "bg-indigo-100 text-indigo-800 rounded",
          holiday: "bg-amber-100 text-amber-800 rounded",
          unavailable: "bg-red-100 text-red-800 rounded",
        }}
        onSelect={interactive ? (date) => date && onDayClick?.(date) : undefined}
        className="p-0"
      />
    </div>
  );
}
