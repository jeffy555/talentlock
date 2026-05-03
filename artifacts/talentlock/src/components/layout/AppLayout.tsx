import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, LayoutDashboard, Users, Briefcase, Calendar, FileText, Bot, User as UserIcon, LogOut, Video, Menu, X } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isEmployer = dbUser?.role === "employer";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ...(isEmployer ? [{ name: "Freelancers", href: "/freelancers", icon: Users }] : []),
    { name: "Jobs", href: "/jobs", icon: Briefcase },
    { name: "Meetings", href: "/meetings", icon: Video },
    { name: "Bookings", href: "/bookings", icon: Calendar },
    { name: "Agreements", href: "/agreements", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navy header */}
      <header
        className="sticky top-0 z-50"
        style={{ backgroundColor: "#0d1f3c", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href={dbUser ? "/dashboard" : "/"} className="flex items-center gap-2 flex-shrink-0">
            <Shield className="h-5 w-5" style={{ color: "#c9a84c" }} />
            <span className="font-bold text-lg tracking-tight text-white">TalentLock</span>
          </Link>

          {dbUser && (
            <>
              {/* Desktop nav — icons only on md, icon+label on xl */}
              <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
                {navigation.map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors"
                          style={
                            isActive
                              ? { backgroundColor: "rgba(201,168,76,0.18)", color: "#c9a84c" }
                              : { color: "rgba(255,255,255,0.6)" }
                          }
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          <span className="hidden xl:inline">{item.name}</span>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="xl:hidden">
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
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-semibold transition-all ml-1"
                        style={
                          location.startsWith("/ai-match")
                            ? { backgroundColor: "#c9a84c", color: "#0d1f3c" }
                            : {
                                background: "linear-gradient(135deg, rgba(201,168,76,0.25) 0%, rgba(201,168,76,0.12) 100%)",
                                color: "#c9a84c",
                                border: "1px solid rgba(201,168,76,0.45)",
                                boxShadow: "0 0 8px rgba(201,168,76,0.15)",
                              }
                        }
                      >
                        <Bot className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden xl:inline">AI Match</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="xl:hidden">
                      AI Match
                    </TooltipContent>
                  </Tooltip>
                )}
              </nav>

              {/* Right side: avatar + mobile hamburger */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Avatar dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 hover:bg-white/10">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: "rgba(201,168,76,0.2)", border: "1px solid rgba(201,168,76,0.35)" }}>
                        {user?.imageUrl ? (
                          <img src={user.imageUrl} alt={user.fullName || ""} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <UserIcon className="h-4 w-4" style={{ color: "#c9a84c" }} />
                        )}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{dbUser.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{dbUser.email}</p>
                        <p className="text-xs font-semibold mt-1 uppercase tracking-wider" style={{ color: "#c9a84c" }}>
                          {dbUser.role}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="w-full cursor-pointer flex items-center">
                        <UserIcon className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => signOut()}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile hamburger — visible below md */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-9 w-9 hover:bg-white/10"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle menu"
                >
                  {mobileMenuOpen
                    ? <X className="h-5 w-5 text-white" />
                    : <Menu className="h-5 w-5 text-white" />}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {dbUser && mobileMenuOpen && (
          <div
            className="md:hidden border-t"
            style={{ backgroundColor: "#0d1f3c", borderColor: "rgba(255,255,255,0.08)" }}
          >
            <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
              {navigation.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors"
                    style={
                      isActive
                        ? { backgroundColor: "rgba(201,168,76,0.18)", color: "#c9a84c" }
                        : { color: "rgba(255,255,255,0.75)" }
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
              {isEmployer && (
                <Link
                  href="/ai-match"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all mt-1"
                  style={
                    location.startsWith("/ai-match")
                      ? { backgroundColor: "#c9a84c", color: "#0d1f3c" }
                      : {
                          background: "rgba(201,168,76,0.12)",
                          color: "#c9a84c",
                          border: "1px solid rgba(201,168,76,0.35)",
                        }
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Bot className="h-4 w-4" />
                  AI Match
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
