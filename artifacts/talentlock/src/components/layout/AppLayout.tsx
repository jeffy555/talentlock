import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Shield, LayoutDashboard, Users, Briefcase, Calendar, FileText, Bot, User as UserIcon, LogOut, Video } from "lucide-react";
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
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={dbUser ? "/dashboard" : "/"} className="flex items-center gap-2.5">
            <Shield className="h-5 w-5" style={{ color: "#c9a84c" }} />
            <span className="font-bold text-lg tracking-tight text-white">TalentLock</span>
          </Link>

          {dbUser && (
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-1 mr-2">
                {navigation.map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                      style={
                        isActive
                          ? { backgroundColor: "rgba(201,168,76,0.18)", color: "#c9a84c" }
                          : { color: "rgba(255,255,255,0.6)" }
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  );
                })}
                {/* AI Match — highlighted gold button for employers */}
                {isEmployer && (
                  <Link
                    href="/ai-match"
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-all ml-1"
                    style={
                      location.startsWith("/ai-match")
                        ? { backgroundColor: "#c9a84c", color: "#0d1f3c" }
                        : {
                            background: "linear-gradient(135deg, rgba(201,168,76,0.25) 0%, rgba(201,168,76,0.12) 100%)",
                            color: "#c9a84c",
                            border: "1px solid rgba(201,168,76,0.45)",
                            boxShadow: "0 0 10px rgba(201,168,76,0.15)",
                          }
                    }
                  >
                    <Bot className="h-4 w-4" />
                    AI Match
                  </Link>
                )}
              </nav>

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
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
