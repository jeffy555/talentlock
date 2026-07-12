import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe, useGetMySubscription } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LayoutDashboard, Users, UsersRound, Briefcase, Calendar, FileText, Bot, User as UserIcon, LogOut, Video, Menu, X, CreditCard, Sparkles, Rocket, Search } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NotificationBell } from "@/components/NotificationBell";
import { useGetCruiseMode, useGetTalentSearch } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: dbUser } = useGetMe({ query: { enabled: !!user } as any });
  const { data: subscription } = useGetMySubscription({ query: { enabled: !!dbUser } as any });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut();
  };

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ...(isEmployer ? [{ name: "Vault", href: "/freelancers", icon: Users }] : []),
    ...(isEnterprise ? [{ name: "Team", href: "/team", icon: UsersRound }] : []),
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
          <Link href={dbUser ? "/dashboard" : "/"} className="flex items-center flex-shrink-0">
            <BrandLogo variant="onDark" size="md" />
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

                {isEmployer && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/talent-search"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ml-2 ${
                          location.startsWith("/talent-search")
                            ? "bg-teal-600/20 text-teal-200 border border-teal-400/40"
                            : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <Search className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden xl:inline">TalentSearch</span>
                        {talentSearchActive && (
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse hidden xl:inline-block" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="xl:hidden bg-primary text-white border-white/10">
                      TalentSearch
                    </TooltipContent>
                  </Tooltip>
                )}

                {isFreelancer && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/cruise-mode"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ml-2 ${
                          location.startsWith("/cruise-mode")
                            ? "bg-gold/20 text-gold border border-gold/40"
                            : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <Rocket className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden xl:inline">Cruise Mode</span>
                        {cruiseModeActive && (
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse hidden xl:inline-block" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="xl:hidden bg-primary text-white border-white/10">
                      Cruise Mode
                    </TooltipContent>
                  </Tooltip>
                )}
              </nav>

              {/* Right side: bell + avatar + mobile hamburger */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <ErrorBoundary fallback={null}>
                  <NotificationBell
                    userId={dbUser.id}
                    triggerClassName="rounded-full h-9 w-9 hover:bg-white/10 text-white ring-offset-primary focus-visible:ring-gold"
                  />
                </ErrorBoundary>

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
              {isEmployer && (
                <div className="pt-2 mt-2 border-t border-white/10">
                  <Link
                    href="/talent-search"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                      location.startsWith("/talent-search")
                        ? "bg-teal-600/30 text-teal-100"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Search className="h-5 w-5" />
                    TalentSearch
                    {talentSearchActive && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </Link>
                </div>
              )}
              {isFreelancer && (
                <div className="pt-2 mt-2 border-t border-white/10">
                  <Link
                    href="/cruise-mode"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all ${
                      location.startsWith("/cruise-mode")
                        ? "bg-gold/30 text-gold"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Rocket className="h-5 w-5" />
                    Cruise Mode
                    {cruiseModeActive && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
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
