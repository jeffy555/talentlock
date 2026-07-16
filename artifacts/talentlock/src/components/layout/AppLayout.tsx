import { useEffect, useState, type ComponentType } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import {
  useGetMe,
  useGetMySubscription,
  useGetCruiseMode,
  useGetTalentSearch,
  useGetMessagesUnreadCount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Briefcase,
  Calendar,
  FileText,
  Bot,
  User as UserIcon,
  LogOut,
  Video,
  Menu,
  X,
  CreditCard,
  Sparkles,
  Rocket,
  Search,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatBoxProvider, useChatBox } from "@/components/messages/ChatBoxProvider";
import { FloatingChatBox } from "@/components/messages/FloatingChatBox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  opensChatBox?: boolean;
  highlight?: boolean;
  pulse?: boolean;
  badge?: number;
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatBoxProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </ChatBoxProvider>
  );
}

function NavLinkRow({
  item,
  active,
  collapsed,
  index,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  index: number;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,55,0.45)]" />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
          active || item.highlight ? "text-gold" : "text-white/55 group-hover:text-gold/90",
        )}
      />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
      )}
      {!collapsed && item.pulse && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
      )}
      {!collapsed && item.badge != null && item.badge > 0 && (
        <span className="ml-auto min-w-[18px] rounded-full bg-blue-500 px-1 text-center text-[10px] font-semibold text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </>
  );

  const className = cn(
    "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
    "transition-all duration-200 ease-out",
    "hover:translate-x-0.5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50",
    active
      ? "combo-nav-active shadow-[inset_0_0_0_1px_rgba(212,175,55,0.12)]"
      : item.highlight
        ? "text-gold/90 hover:bg-gold/15"
        : "combo-nav-idle",
    collapsed && "justify-center px-2",
  );

  const inner = item.opensChatBox ? (
    <button type="button" onClick={onNavigate} className={className}>
      {content}
    </button>
  ) : (
    <Link href={item.href} onClick={onNavigate} className={className}>
      {content}
    </Link>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.03 * index, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="border-white/10 bg-primary text-white">
            {item.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        inner
      )}
    </motion.div>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { openInbox } = useChatBox();
  const { data: dbUser } = useGetMe({ query: { enabled: !!user } as any });
  const { data: subscription } = useGetMySubscription({ query: { enabled: !!dbUser } as any });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const queryClient = useQueryClient();

  const isEmployer = dbUser?.role === "employer";
  const isFreelancer = dbUser?.role === "freelancer";
  const isEnterprise = subscription?.plan?.id === "employer_enterprise";
  const { data: cruiseConfig } = useGetCruiseMode({
    query: { enabled: isFreelancer } as any,
  });
  const cruiseModeActive = cruiseConfig?.isActive === true;
  const { data: talentSearchConfig } = useGetTalentSearch({
    query: { enabled: isEmployer } as any,
  });
  const talentSearchActive = talentSearchConfig?.isActive === true;
  const { data: unreadMessages } = useGetMessagesUnreadCount({
    query: { enabled: !!dbUser, refetchInterval: 30_000 } as any,
  });
  const unreadCount = Number(unreadMessages?.count ?? 0);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut();
  };

  const workspaceNav: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ...(isEmployer ? [{ name: "Vault", href: "/freelancers", icon: Users }] : []),
    ...(isEnterprise ? [{ name: "Team", href: "/team", icon: UsersRound }] : []),
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Meetings", href: "/meetings", icon: Video },
    { name: "Bookings", href: "/bookings", icon: Calendar },
    {
      name: "Messages",
      href: "/messages",
      icon: MessageSquare,
      opensChatBox: true,
      badge: unreadCount,
    },
    { name: "Agreements", href: "/agreements", icon: FileText },
  ];

  const intelligenceNav: NavItem[] = [
    ...(isEmployer
      ? [
          { name: "AI Match", href: "/ai-match", icon: Bot, highlight: true },
          {
            name: "TalentSearch",
            href: "/talent-search",
            icon: Search,
            pulse: talentSearchActive,
          },
        ]
      : []),
    ...(isFreelancer
      ? [
          {
            name: "Cruise Mode",
            href: "/cruise-mode",
            icon: Rocket,
            pulse: cruiseModeActive,
          },
        ]
      : []),
  ];

  const renderNavGroups = (isCollapsed: boolean, onNavigate: () => void) => {
    let index = 0;
    return (
      <div className="flex flex-col gap-6">
        <div>
          {!isCollapsed && (
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
              Workspace
            </p>
          )}
          <nav className="flex flex-col gap-0.5" aria-label="Workspace">
            {workspaceNav.map((item) => {
              const active = !item.opensChatBox && location.startsWith(item.href);
              const i = index++;
              return (
                <NavLinkRow
                  key={item.name}
                  item={item}
                  active={active}
                  collapsed={isCollapsed}
                  index={i}
                  onNavigate={() => {
                    if (item.opensChatBox) openInbox();
                    onNavigate();
                  }}
                />
              );
            })}
          </nav>
        </div>

        {intelligenceNav.length > 0 && (
          <div>
            {!isCollapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                Intelligence
              </p>
            )}
            <nav className="flex flex-col gap-0.5" aria-label="Intelligence">
              {intelligenceNav.map((item) => {
                const active = location.startsWith(item.href);
                const i = index++;
                return (
                  <NavLinkRow
                    key={item.name}
                    item={item}
                    active={active}
                    collapsed={isCollapsed}
                    index={i}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </nav>
          </div>
        )}
      </div>
    );
  };

  const sidebarInner = (opts: { collapsed: boolean; onNavigate: () => void; showCollapseToggle?: boolean }) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 border-b border-white/10 px-4 py-4", opts.collapsed && "justify-center px-2")}>
        <Link href={dbUser ? "/dashboard" : "/"} className="min-w-0" onClick={opts.onNavigate}>
          <BrandLogo variant="onDark" size="md" showWordmark={!opts.collapsed} />
        </Link>
        {opts.showCollapseToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto hidden h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white lg:inline-flex"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={opts.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {opts.collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {renderNavGroups(opts.collapsed, opts.onNavigate)}
      </div>

      <div className={cn("border-t border-white/10 p-3", opts.collapsed && "px-2")}>
        {dbUser && !opts.collapsed && (
          <div className="mb-2 rounded-lg bg-white/[0.04] px-3 py-2">
            <p className="truncate text-xs font-semibold text-white">{dbUser.name}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-gold/80">{dbUser.role}</p>
          </div>
        )}
        {!opts.collapsed && (
          <Link
            href="/pricing"
            onClick={opts.onNavigate}
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gold/80 transition-all hover:translate-x-0.5 hover:bg-gold/10 hover:text-gold"
          >
            <Sparkles className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            Upgrade plan
          </Link>
        )}
      </div>
    </div>
  );

  if (!dbUser) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-primary">
          <div className="container mx-auto flex h-16 items-center px-4">
            <Link href="/">
              <BrandLogo variant="onDark" size="md" />
            </Link>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8 md:py-12 animate-fade-in">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans md:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-40 hidden h-[100dvh] shrink-0 flex-col border-r border-white/10 bg-primary md:flex",
          "transition-[width] duration-300 ease-out",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        {sidebarInner({
          collapsed,
          onNavigate: () => undefined,
          showCollapseToggle: true,
        })}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-primary shadow-2xl md:hidden"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3 h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </Button>
              {sidebarInner({ collapsed: false, onNavigate: () => setMobileOpen(false) })}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/80 bg-background/90 px-4 backdrop-blur-md md:h-16 md:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <p className="hidden text-sm text-muted-foreground sm:block md:hidden">Menu</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ErrorBoundary fallback={null}>
              <NotificationBell
                userId={dbUser.id}
                triggerClassName="rounded-full h-9 w-9 hover:bg-primary/5 text-foreground ring-offset-background focus-visible:ring-gold"
              />
            </ErrorBoundary>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-9 w-9 hover:bg-primary/5 ring-offset-background focus-visible:ring-gold"
                >
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gold/30 bg-gold/10">
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
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gold">
                      {dbUser.role}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex w-full cursor-pointer items-center">
                    <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    Profile Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/billing" className="flex w-full cursor-pointer items-center">
                    <CreditCard className="mr-2 h-4 w-4 text-muted-foreground" />
                    Billing & Plan
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pricing" className="flex w-full cursor-pointer items-center">
                    <Sparkles className="mr-2 h-4 w-4 text-gold" />
                    Upgrade
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 md:px-8 md:py-10 animate-fade-in">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      <FloatingChatBox />
    </div>
  );
}
