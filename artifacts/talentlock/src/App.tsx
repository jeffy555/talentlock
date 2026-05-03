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

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
  },
  variables: {
    colorPrimary: "#0d1f3c",
    colorForeground: "#0d1f3c",
    colorMutedForeground: "hsl(220 12% 48%)",
    colorDanger: "hsl(0 84.2% 60.2%)",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#0d1f3c",
    colorNeutral: "hsl(38 18% 86%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-md w-[440px] max-w-full overflow-hidden shadow-xl border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
  },
};

function AuthPageWrapper({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
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
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}

function DemoLoginPanel() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginAs = async (email: string, password: string, label: string) => {
    if (!isLoaded || !signIn) return;
    setLoading(label);
    setError(null);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "errors" in err
        ? (err as { errors: Array<{ message: string }> }).errors?.[0]?.message
        : err instanceof Error ? err.message : "Sign-in failed";
      setError(msg ?? "Sign-in failed");
    } finally {
      setLoading(null);
    }
  };

  const accounts = [
    {
      label: "Employer",
      email: "employer@talentlock.com",
      password: "employer",
      description: "TalentLock Demo Corp",
      color: "#c9a84c",
    },
    {
      label: "Freelancer",
      email: "employee@talentlock.com",
      password: "employee",
      description: "Full-Stack Dev · $95/hr",
      color: "#5b8dee",
    },
  ];

  return (
    <div className="w-full max-w-[440px] mx-auto mt-5">
      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Quick Demo Login
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {accounts.map((acc) => (
          <button
            key={acc.label}
            onClick={() => loginAs(acc.email, acc.password, acc.label)}
            disabled={!!loading}
            className="group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:shadow-md disabled:opacity-60 active:scale-95"
            style={{ borderColor: `${acc.color}44`, backgroundColor: `${acc.color}09` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: acc.color }}>
                {loading === acc.label ? "Signing in…" : acc.label}
              </span>
              {loading === acc.label && (
                <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: acc.color }} />
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{acc.email}</p>
              <p className="text-xs text-muted-foreground">pw: <span className="font-mono">{acc.password}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{acc.description}</p>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-xs text-destructive text-center px-2">{error}</p>
      )}
    </div>
  );
}

function SignInPage() {
  return (
    <AuthPageWrapper>
      <div className="w-full flex flex-col items-center">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
        <DemoLoginPanel />
      </div>
    </AuthPageWrapper>
  );
}

function SignUpPage() {
  return (
    <AuthPageWrapper>
      <div className="w-full flex flex-col items-center">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
        <DemoLoginPanel />
      </div>
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
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

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

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
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
