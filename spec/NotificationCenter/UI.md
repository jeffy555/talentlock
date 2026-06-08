# TalentLock — UI Specification: Notifications Centre

## Overview

This document specifies the complete UI for the Notifications Centre. Four new components, one nav integration, all states, all copy strings, and all interactions.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**All authenticated users.** Both employers and freelancers see the bell and receive notifications.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Unread dot | `h-2 w-2 rounded-full bg-blue-500 shrink-0` | Unread indicator on item |
| Unread item bg | `bg-blue-50` | Background of unread items |
| Read item bg | `bg-white` | Background of read items |
| Badge bg | `bg-red-500 text-white` | Unread count badge |
| Today group label | `text-xs font-semibold text-slate-500 uppercase tracking-wide` | Group header |
| Item message | `text-sm text-slate-700` | Notification message text |
| Item time | `text-xs text-muted-foreground` | Relative timestamp |
| Panel border | `border border-slate-200 shadow-lg rounded-lg` | Popover content |
| Empty state | `text-sm text-muted-foreground text-center py-8` | No notifications |

---

## Notification Type Icons

Each notification type shows a contextual icon. Use lucide-react icons:

| Entity Type | Icon | Color |
|---|---|---|
| `booking` | `<Briefcase className="h-4 w-4" />` | `text-blue-500` |
| `agreement` | `<FileText className="h-4 w-4" />` | `text-violet-500` |
| `meeting` | `<Calendar className="h-4 w-4" />` | `text-emerald-500` |
| `review` | `<Star className="h-4 w-4" />` | `text-amber-500` |
| `document` | `<ShieldCheck className="h-4 w-4" />` | `text-emerald-500` |
| `milestone` | `<CheckSquare className="h-4 w-4" />` | `text-blue-500` |

---

## Component 1 — `<UnreadBadge />`

**File:** `artifacts/talentlock/src/components/UnreadBadge.tsx`

### Props

```ts
interface UnreadBadgeProps {
  count: number;
}
```

### Rendering

```tsx
<span className="
  absolute -top-1 -right-1
  h-4 min-w-[1rem] px-0.5
  rounded-full
  bg-red-500 text-white
  text-[10px] font-bold
  flex items-center justify-center
  leading-none
">
  {count > 99 ? '99+' : count}
</span>
```

- Positioned absolutely over the bell icon (parent must be `relative`)
- Shows `99+` when count exceeds 99
- `min-w-[1rem]` ensures it stays circular for single digits

---

## Component 2 — `<NotificationItem />`

**File:** `artifacts/talentlock/src/components/NotificationItem.tsx`

### Props

```ts
interface NotificationItemProps {
  notification: {
    id: number;
    type: string;
    entityType: string;
    entityId: string;
    message: string;
    read: boolean;
    createdAt: string;
  };
  onRead: (id: number) => void;
}
```

### Rendered Item

```
┌────────────────────────────────────────────────────┐
│  bg-blue-50 (unread) or bg-white (read)            │
│                                                    │
│  [●] [Icon]  Message text goes here                │
│              2 hours ago                           │
└────────────────────────────────────────────────────┘
```

```tsx
<button
  onClick={() => {
    onRead(notification.id);
    navigate(getNotificationRoute(notification.entityType, notification.entityId));
  }}
  className={`
    w-full text-left px-4 py-3
    flex items-start gap-3
    hover:bg-slate-50 transition-colors
    ${notification.read ? 'bg-white' : 'bg-blue-50'}
  `}
>
  {/* Unread dot */}
  {!notification.read && (
    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
  )}
  {notification.read && <span className="w-2 shrink-0" />}

  {/* Entity icon */}
  <span className="shrink-0 mt-0.5">
    <EntityIcon entityType={notification.entityType} />
  </span>

  {/* Text */}
  <div className="flex-1 min-w-0">
    <p className="text-sm text-slate-700 leading-snug">{notification.message}</p>
    <p className="text-xs text-muted-foreground mt-0.5">
      {formatRelativeTime(notification.createdAt)}
    </p>
  </div>
</button>
```

### `formatRelativeTime()` helper

```ts
// artifacts/talentlock/src/lib/formatRelativeTime.ts
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24)  return `${diffHr}h ago`;
  if (diffDay < 7)  return `${diffDay}d ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}
```

---

## Component 3 — `<NotificationPanel />`

**File:** `artifacts/talentlock/src/components/NotificationPanel.tsx`

### Props

```ts
interface NotificationPanelProps {
  onClose: () => void;
}
```

### State 1 — Loading

```
Notifications
──────────────────────────────────────────────────────

[Skeleton — h-16 w-full]
[Skeleton — h-16 w-full]
[Skeleton — h-16 w-full]
```

Three skeleton items while `isLoading === true`.

### State 2 — Empty

```
Notifications
──────────────────────────────────────────────────────

        🔔
   No notifications yet.
   You'll be notified when something needs your attention.
```

Bell icon: `<Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />`
Text: `text-sm text-muted-foreground text-center py-8`

### State 3 — Loaded

```
┌────────────────────────────────────────────────────┐
│  Notifications                  [Mark all read]    │
│  ────────────────────────────────────────────────  │
│  TODAY                                             │
│  [NotificationItem — unread]                       │
│  [NotificationItem — unread]                       │
│  [NotificationItem — read]                         │
│  ────────────────────────────────────────────────  │
│  EARLIER                                           │
│  [NotificationItem — read]                         │
│  [NotificationItem — read]                         │
└────────────────────────────────────────────────────┘
```

**Header:**
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
  <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
  {hasUnread && (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs text-blue-600 hover:text-blue-700 h-auto py-0"
      onClick={handleMarkAllRead}
    >
      Mark all read
    </Button>
  )}
</div>
```

**Grouped list:**

Group logic:
```ts
const today = notifications.filter(n =>
  new Date(n.createdAt).toDateString() === new Date().toDateString()
);
const earlier = notifications.filter(n =>
  new Date(n.createdAt).toDateString() !== new Date().toDateString()
);
```

Group label:
```tsx
<p className="px-4 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
  Today
</p>
```

**Scrollable list:** `max-h-[400px] overflow-y-auto` on the list container.

**"Mark all read" behaviour:**
- Calls `usePatchNotificationsReadAll()` mutation
- On success: refetches both `useGetNotifications()` and `useGetNotificationsUnreadCount()`
- Button hidden when all notifications are already read (`hasUnread === false`)

### State 4 — Error

```
Could not load notifications.    [Retry]
```

`text-sm text-muted-foreground text-center py-8`. Retry calls `refetch()`.

---

## Component 4 — `<NotificationBell />`

**File:** `artifacts/talentlock/src/components/NotificationBell.tsx`

### Full Component

```tsx
export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data } = useGetNotificationsUnreadCount({
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const unreadCount = data?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0 shadow-lg"
        align="end"
        sideOffset={8}
      >
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
```

### Error Boundary Wrapper

In the nav component, the bell is wrapped:

```tsx
<ErrorBoundary fallback={null}>
  <NotificationBell />
</ErrorBoundary>
```

If the bell crashes for any reason, `fallback={null}` renders nothing. The rest of the nav is unaffected.

---

## Page Integration — Navigation

**File:** Nav component (confirmed in Task 4.1)

### DOM Position

```
[Logo]  [Nav links...]          [NotificationBell]  [User Avatar ▾]
```

The bell is the second-to-last element in the right side of the nav, immediately before the user avatar/dropdown.

### Render Condition

```tsx
{isAuthenticated && (
  <ErrorBoundary fallback={null}>
    <NotificationBell />
  </ErrorBoundary>
)}
```

Not rendered on:
- `/sign-in`, `/sign-up` — unauthenticated pages
- `/onboarding` — pre-auth setup
- `/admin`, `/admin/login` — admin uses separate auth
- `/f/:id` — public page

---

## Responsive Behaviour

| Breakpoint | Bell | Dropdown panel |
|---|---|---|
| Mobile (`< md`) | Visible — same size | `w-[calc(100vw-2rem)]` — nearly full width, max 380px |
| Tablet (`md`) | Visible | `w-[380px]` fixed |
| Desktop | Visible | `w-[380px]` fixed |

On mobile, the popover content width adjusts:
```tsx
<PopoverContent className="w-[min(380px,calc(100vw-2rem))] p-0" align="end">
```

---

## Copy Reference

| Location | String |
|---|---|
| Bell aria-label (no unread) | `Notifications` |
| Bell aria-label (with unread) | `Notifications, {N} unread` |
| Panel heading | `Notifications` |
| Mark all read button | `Mark all read` |
| Group label — today | `Today` |
| Group label — earlier | `Earlier` |
| Empty heading | `No notifications yet.` |
| Empty subtitle | `You'll be notified when something needs your attention.` |
| Error message | `Could not load notifications.` |
| Error retry | `Retry` |
| Badge overflow | `99+` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `UnreadBadge` | Hidden (no skeleton) | Hidden — fail silently |
| `NotificationItem` | N/A (parent handles) | N/A |
| `NotificationPanel` | 3 skeleton items | `"Could not load notifications."` + Retry |
| `NotificationBell` | Badge absent while loading | Error boundary → renders nothing |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/UnreadBadge.tsx` | **New** | 4.4 |
| `src/components/NotificationItem.tsx` | **New** | 4.5 |
| `src/components/NotificationPanel.tsx` | **New** | 4.6 |
| `src/components/NotificationBell.tsx` | **New** | 4.7 |
| `src/lib/notificationRoutes.ts` | **New** | 4.2 |
| `src/lib/formatRelativeTime.ts` | **New** | 4.5 |
| Nav component (confirmed path) | Modified | 4.8 |
