import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  useGetMe,
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, LayoutDashboard, Users, Briefcase, Calendar, FileText, Bot, User as UserIcon, LogOut, Video, Menu, X, Bell, CheckCheck, CreditCard, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: dbUser } = useGetMe({ query: { enabled: !!user } as any });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  const isEmployer = dbUser?.role === "employer";

  // Scope the notifications cache to the current user so that switching
  // accounts inside the same SPA session never displays the previous user's
  // cached notifications.
  const { data: notifications } = useListNotifications({
    query: {
      enabled: !!dbUser,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      queryKey: [...getListNotificationsQueryKey(), dbUser?.id ?? "anon"],
    } as any,
  });

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut();
  };
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const handleNotificationClick = async (notif: { id: number; read: boolean; link?: string | null }) => {
    if (!notif.read) {
      try {
        await markRead.mutateAsync({ id: notif.id });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      } catch {}
    }
    if (notif.link) setLocation(notif.link);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    } catch {}
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ...(isEmployer ? [{ name: "Vault", href: "/freelancers", icon: Users }] : []),
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Meetings", href: "/meetings", icon: Video },
    { name: "Bookings", href: "/bookings", icon: Calendar },
    { name: "Agreements", href: "/agreements", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Navy header */}
      <header
        className="sticky top-0 z-50 bg-primary border-b border-white/10"
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href={dbUser ? "/dashboard" : "/"} className="flex items-center gap-2 flex-shrink-0">
            <Shield className="h-5 w-5 text-gold" />
            <span className="font-serif font-bold text-lg tracking-tight text-white">TalentLock</span>
          </Link>

          {dbUser && (
            <>
              {/* Desktop nav — icons only on md, icon+label on xl */}
              <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
                {navigation.map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? "bg-gold/10 text-gold"
                              : "text-white/60 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          <span className="hidden xl:inline">{item.name}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="xl:hidden bg-primary text-white border-white/10">
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* AI Match — gold highlighted, employer only */}
                {isEmployer && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/ai-match"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-all duration-200 ml-2 ${
                          location.startsWith("/ai-match")
                            ? "bg-gold text-primary shadow-md shadow-gold/20"
                            : "bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20"
                        }`}
                      >
                        <Bot className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden xl:inline">AI Match</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="xl:hidden bg-gold text-primary border-gold/50 font-medium">
                      AI Match
                    </TooltipContent>
                  </Tooltip>
                )}
              </nav>

              {/* Right side: bell + avatar + mobile hamburger */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Notifications bell */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative rounded-full h-9 w-9 hover:bg-white/10 text-white ring-offset-primary focus-visible:ring-gold"
                      aria-label="Notifications"
                      data-testid="button-notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-gold text-primary text-[10px] font-bold flex items-center justify-center shadow-sm"
                          data-testid="badge-unread-count"
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-[360px] p-0 font-sans"
                    sideOffset={8}
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <div>
                        <p className="font-serif text-base font-bold text-foreground">Notifications</p>
                        <p className="text-[11px] text-muted-foreground">
                          {unreadCount === 0 ? "You're all caught up" : `${unreadCount} unread`}
                        </p>
                      </div>
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleMarkAllRead}
                          className="text-xs h-8 text-muted-foreground hover:text-primary"
                          data-testid="button-mark-all-read"
                        >
                          <CheckCheck className="h-3.5 w-3.5 mr-1" />
                          Mark all read
                        </Button>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {!notifications || notifications.length === 0 ? (
                        <div className="px-4 py-12 text-center">
                          <div className="h-10 w-10 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Bell className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">No notifications yet</p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-border/60">
                          {notifications.map((n) => (
                            <li key={n.id}>
                              <button
                                type="button"
                                onClick={() => handleNotificationClick(n)}
                                className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex gap-3 ${
                                  !n.read ? "bg-gold/5" : ""
                                }`}
                                data-testid={`notification-item-${n.id}`}
                              >
                                <div className="flex-shrink-0 mt-1.5">
                                  <span
                                    className={`block h-2 w-2 rounded-full ${
                                      !n.read ? "bg-gold" : "bg-transparent"
                                    }`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-snug ${!n.read ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                                    {n.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                    {n.message}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground/70 mt-1.5 uppercase tracking-wider font-semibold">
                                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                  </p>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Avatar dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 hover:bg-white/10 ring-offset-primary focus-visible:ring-gold">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center overflow-hidden bg-gold/10 border border-gold/30">
                        {user?.imageUrl ? (
                          <img src={user.imageUrl} alt={user.fullName || ""} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <UserIcon className="h-4 w-4 text-gold" />
                        )}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 font-sans">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-semibold leading-none text-foreground">{dbUser.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{dbUser.email}</p>
                        <p className="text-[10px] font-bold mt-2 uppercase tracking-widest text-gold">
                          {dbUser.role}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="w-full cursor-pointer flex items-center">
                        <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        Profile Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/billing" className="w-full cursor-pointer flex items-center">
                        <CreditCard className="mr-2 h-4 w-4 text-muted-foreground" />
                        Billing & Plan
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/pricing" className="w-full cursor-pointer flex items-center">
                        <Sparkles className="mr-2 h-4 w-4 text-gold" />
                        Upgrade
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleSignOut}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger — visible below md */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-9 w-9 hover:bg-white/10 text-white"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {dbUser && mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-primary shadow-xl">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navigation.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-gold/10 text-gold" : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
              {isEmployer && (
                <div className="pt-2 mt-2 border-t border-white/10">
                  <Link
                    href="/ai-match"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all ${
                      location.startsWith("/ai-match")
                        ? "bg-gold text-primary shadow-md"
                        : "bg-gold/10 text-gold border border-gold/30"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Bot className="h-5 w-5" />
                    AI Match
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 md:py-12 animate-fade-in">
        {children}
      </main>
    </div>
  );
}
