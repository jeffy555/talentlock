interface UnreadBadgeProps {
  count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  return (
    <span
      className="
        absolute -top-1 -right-1
        h-4 min-w-[1rem] px-0.5
        rounded-full
        bg-red-500 text-white
        text-[10px] font-bold
        flex items-center justify-center
        leading-none
      "
      data-testid="badge-unread-count"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
