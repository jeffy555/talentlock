import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useSignIn } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { setAuthTokenGetter } from "@workspace/api-client-react";

import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import FreelancersList from "@/pages/FreelancersList";
import FreelancerDetail from "@/pages/FreelancerDetail";
import JobsList from "@/pages/JobsList";
import PostJob from "@/pages/PostJob";
import JobDetail from "@/pages/JobDetail";
import BookingsList from "@/pages/BookingsList";
import BookingDetail from "@/pages/BookingDetail";
import AgreementsList from "@/pages/AgreementsList";
import AgreementDetail from "@/pages/AgreementDetail";
import AiMatch from "@/pages/AiMatch";
import Profile from "@/pages/Profile";
import MeetingsList from "@/pages/MeetingsList";
import MeetingDetail from "@/pages/MeetingDetail";
import Pricing from "@/pages/Pricing";
import Billing from "@/pages/Billing";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import PublicProfile from "@/pages/PublicProfile";
import Team from "@/pages/Team";
import TeamAnalytics from "@/pages/TeamAnalytics";
import AcceptInvite from "@/pages/AcceptInvite";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
// Clerk proxy only works in production (Replit/custom domain). Localhost loads Clerk from Clerk's CDN.
const clerkProxyUrlForEnv =
  import.meta.env.PROD && clerkProxyUrl ? clerkProxyUrl : undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  console.error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
  },
  variables: {
    colorPrimary: "hsl(222, 47%, 11%)",
    colorForeground: "hsl(222, 47%, 11%)",
    colorMutedForeground: "hsl(222, 12%, 48%)",
    colorDanger: "hsl(0, 84.2%, 60.2%)",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "hsl(222, 47%, 11%)",
    colorNeutral: "hsl(40, 10%, 90%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-xl w-[440px] max-w-full overflow-hidden shadow-2xl border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none p-8",
    headerTitle: "font-serif text-2xl text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButton: "rounded-md border border-border bg-white text-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground bg-white",
    formFieldLabel: "text-foreground font-medium",
    formFieldInput: "rounded-md border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
    formButtonPrimary: "rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 w-full transition-colors",
    footerActionLink: "text-primary hover:text-primary/90 hover:underline",
    footer: "!shadow-none !border-0 !bg-secondary/30 !rounded-none p-4",
  },
};

function AuthPageWrapper({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background font-sans">
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}
      >
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to home
        </button>
        <button
          onClick={() => setLocation("/")}
          aria-label="Close"
          className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12 animate-fade-in">
        <div className="w-full max-w-[440px] space-y-6">
          <div className="text-center space-y-2 mb-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
                <svg className="h-5 w-5 text-gold" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
              </div>
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">Welcome to TalentLock</h1>
            <p className="text-sm text-muted-foreground font-light">Secure access to the premium talent network.</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function DemoLoginPanel() {
  const { signIn } = useSignIn();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginAs = async (role: string, label: string) => {
    if (!signIn) {
      setError("Auth not ready yet, please try again.");
      return;
    }
    setLoading(label);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/demo/sign-in-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const payload = await res.json() as { token?: unknown };
      const token = typeof payload.token === "string" ? payload.token : "";
      if (!token) {
        throw new Error("Demo sign-in token missing or malformed.");
      }
      const createResult = await signIn.create({ strategy: "ticket", ticket: token });
      if (createResult.error) {
        throw new Error(createResult.error.message ?? "Ticket sign-in failed.");
      }
      const finalizeResult = await signIn.finalize();
      if (finalizeResult.error) {
        throw new Error(finalizeResult.error.message ?? "Failed to activate session.");
      }
      setLocation("/dashboard");
    } catch (err: unknown) {
      console.error("[DemoLogin] sign-in error:", err);
      let msg = "Sign-in failed.";
      if (err && typeof err === "object" && "message" in err) {
        msg = (err as { message: string }).message;
      }
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  const accounts = [
    {
      role: "employer",
      label: "Employer",
      email: "employer@talentlock.com",
      description: "TalentLock Demo Corp",
      color: "hsl(var(--primary))",
      textColor: "hsl(var(--gold))",
      bgClass: "bg-primary/5 hover:bg-primary/10 border-primary/20",
    },
    {
      role: "freelancer",
      label: "Freelancer",
      email: "employee@talentlock.com",
      description: "Full-Stack Dev · $95/hr",
      color: "hsl(var(--foreground))",
      textColor: "hsl(var(--foreground))",
      bgClass: "bg-secondary/50 hover:bg-secondary border-border",
    },
  ];

  return (
    <div className="w-full mt-8 animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.2em]">
            Or proceed with demo
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {accounts.map((acc) => (
          <button
            key={acc.label}
            onClick={() => loginAs(acc.role, acc.label)}
            disabled={!!loading}
            className={`group flex flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-300 disabled:opacity-50 active:scale-[0.98] ${acc.bgClass}`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: acc.textColor }}>
                {loading === acc.label ? "Authenticating…" : acc.label}
              </span>
              {loading === acc.label && (
                <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: acc.textColor }} />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{acc.email}</p>
              <p className="text-xs text-muted-foreground mt-1 font-light">{acc.description}</p>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive text-center">
          {error}
        </div>
      )}
    </div>
  );
}

// Demo login is only shown in local dev. The published app relies on Google /
// email sign-in via Clerk so we don't expose shared demo accounts publicly.
const SHOW_DEMO_LOGIN = import.meta.env.DEV;

function SignInPage() {
  return (
    <AuthPageWrapper>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      {SHOW_DEMO_LOGIN && <DemoLoginPanel />}
    </AuthPageWrapper>
  );
}

function SignUpPage() {
  return (
    <AuthPageWrapper>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      {SHOW_DEMO_LOGIN && <DemoLoginPanel />}
    </AuthPageWrapper>
  );
}

function ClerkAuthTokenSetter() {
  const { session } = useClerk();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!session) return null;
      try {
        return await session.getToken();
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [session]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener, session } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
        // Track auth event in audit log. The login fires when userId transitions
        // from null/undefined to a real id; logout fires on the reverse.
        const wasSignedIn = !!prevUserIdRef.current;
        const isSignedIn = !!userId;
        const path = isSignedIn && !wasSignedIn ? "track-login" : !isSignedIn && wasSignedIn ? "track-logout" : null;
        if (path) {
          (async () => {
            try {
              const token = isSignedIn ? await session?.getToken() : null;
              await fetch(`${basePath}/api/auth/${path}`, {
                method: "POST",
                credentials: "include",
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              });
            } catch {
              // best-effort; never block UX on audit logging
            }
          })();
        }
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient, session]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">Configuration error</h1>
          <p className="text-sm text-muted-foreground">
            Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code> in the project <code>.env</code> file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrlForEnv}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthTokenSetter />
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/onboarding" component={() => <ProtectedRoute component={Onboarding} />} />
          <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
          <Route path="/freelancers" component={() => <ProtectedRoute component={FreelancersList} />} />
          <Route path="/freelancers/:id" component={() => <ProtectedRoute component={FreelancerDetail} />} />
          <Route path="/jobs" component={() => <ProtectedRoute component={JobsList} />} />
          <Route path="/jobs/new" component={() => <ProtectedRoute component={PostJob} />} />
          <Route path="/jobs/:id" component={() => <ProtectedRoute component={JobDetail} />} />
          <Route path="/bookings" component={() => <ProtectedRoute component={BookingsList} />} />
          <Route path="/bookings/:id" component={() => <ProtectedRoute component={BookingDetail} />} />
          <Route path="/agreements" component={() => <ProtectedRoute component={AgreementsList} />} />
          <Route path="/agreements/:id" component={() => <ProtectedRoute component={AgreementDetail} />} />
          <Route path="/ai-match" component={() => <ProtectedRoute component={AiMatch} />} />
          <Route path="/meetings" component={() => <ProtectedRoute component={MeetingsList} />} />
          <Route path="/meetings/:id" component={() => <ProtectedRoute component={MeetingDetail} />} />
          <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
          <Route path="/pricing" component={() => <ProtectedRoute component={Pricing} />} />
          <Route path="/billing" component={() => <ProtectedRoute component={Billing} />} />
          <Route path="/team" component={() => <ProtectedRoute component={Team} />} />
          <Route path="/team/analytics" component={() => <ProtectedRoute component={TeamAnalytics} />} />
          <Route path="/team/accept-invite" component={AcceptInvite} />

          <Route path="/f/:id" component={PublicProfile} />

          <Route path="/admin/login" component={AdminLogin} />
          <Route path="/admin" component={AdminDashboard} />

          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}
