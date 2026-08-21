import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Link, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, FileSignature, Zap, Briefcase, Building2, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  isRegistrationComplete,
  needsOnboarding,
  RegistrationCheckStatus,
} from "@/components/OnboardingGate";

const ME_CHECK_TIMEOUT_MS = 8000;

function setIntendedRole(role: "freelancer" | "employer") {
  try {
    sessionStorage.setItem("talentlock_intended_role", role);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem("talentlock_intended_role", role);
  } catch {
    /* ignore */
  }
}

export default function Landing() {
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const {
    data: dbUser,
    isLoading: isLoadingUser,
    isError: isMeError,
    isSuccess: isMeSuccess,
  } = useGetMe({
    query: {
      enabled: !!isSignedIn,
      refetchOnMount: "always",
    } as any,
  });

  const [meTimedOut, setMeTimedOut] = useState(false);
  useEffect(() => {
    if (!isSignedIn || isMeSuccess || isMeError) {
      setMeTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setMeTimedOut(true), ME_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [isSignedIn, isMeSuccess, isMeError]);

  const meSettled = isMeSuccess || isMeError || meTimedOut;
  // Wait only for Clerk + the first /users/me result. Incomplete, 404, and
  // timeouts must leave this screen — never spin on background refetch.
  const authSettling =
    !isLoaded || (!!isSignedIn && !meSettled && isLoadingUser);
  const registrationIncomplete =
    !!isSignedIn &&
    isLoaded &&
    !authSettling &&
    (isMeError || meTimedOut || needsOnboarding(dbUser));
  const registrationComplete =
    !!isSignedIn &&
    isLoaded &&
    !authSettling &&
    isMeSuccess &&
    isRegistrationComplete(dbUser);

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut({ redirectUrl: "/" });
  };

  if (authSettling) {
    return isSignedIn ? (
      <RegistrationCheckStatus onSignOut={() => void handleSignOut()} />
    ) : (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="mx-auto h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-foreground">Loading…</p>
          <p className="text-xs text-muted-foreground">Preparing TalentLock</p>
        </div>
      </div>
    );
  }

  // Fully registered users only — never redirect while /users/me is still in flight
  if (registrationComplete) {
    return <Redirect to="/dashboard" replace />;
  }

  const handleFreelancerSignup = () => {
    if (!isLoaded || authSettling) return;
    setIntendedRole("freelancer");
    if (isSignedIn) {
      // Incomplete → registration form. Complete users never see these buttons
      // (they already redirected), but keep the safe path explicit.
      setLocation(registrationComplete ? "/dashboard" : "/onboarding");
      return;
    }
    setLocation("/sign-up");
  };

  const handleEmployerSignup = () => {
    if (!isLoaded || authSettling) return;
    setIntendedRole("employer");
    if (isSignedIn) {
      setLocation(registrationComplete ? "/dashboard" : "/onboarding");
      return;
    }
    setLocation("/sign-up");
  };

  return (
    <div className="bg-background font-sans">
      {/* First viewport: header + hero CTAs stay fully visible without scrolling */}
      <div className="min-h-svh flex flex-col">
      {/* Header — deep navy */}
      <header
        className="sticky top-0 z-50 px-6 h-16 shrink-0 flex items-center justify-between"
        style={{ backgroundColor: "hsl(var(--primary))", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center">
          <BrandLogo variant="onDark" size="md" />
        </div>
        <div className="flex items-center gap-3">
          {registrationIncomplete ? (
            <>
              <Link
                href="/onboarding"
                className="rounded-md bg-gold px-3 py-1.5 text-xs font-semibold text-primary hover:bg-gold/90 sm:text-sm"
              >
                Continue registration
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm font-medium transition-colors text-white/70 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="text-sm font-medium transition-colors text-white/70 hover:text-white"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {registrationIncomplete && (
        <div className="shrink-0 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm text-foreground">
          {isMeError || meTimedOut ? (
            <>
              We could not confirm a finished account, so the dashboard stayed closed.{" "}
              <Link href="/onboarding" className="font-semibold text-primary underline-offset-2 hover:underline">
                Continue registration
              </Link>
              {" "}or sign out.
            </>
          ) : (
            <>
              Finish registration to access your dashboard. Choose Freelancer or Employer below, or{" "}
              <Link href="/onboarding" className="font-semibold text-primary underline-offset-2 hover:underline">
                continue where you left off
              </Link>
              .
            </>
          )}
        </div>
      )}

      <section
          className="relative overflow-hidden flex-1 flex flex-col items-center justify-center text-center px-6 py-6 sm:py-8"
          style={{ background: "linear-gradient(160deg, hsl(222 47% 11%) 0%, hsl(222 47% 15%) 55%, hsl(222 47% 11%) 100%)" }}
        >
          {/* Grid texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: "linear-gradient(hsl(var(--gold)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--gold)) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          <div className="relative z-10 max-w-3xl mx-auto animate-slide-up-fade">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-5 text-xs font-semibold uppercase tracking-widest bg-gold/10 text-gold border border-gold/20 backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Premium Talent Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-white mb-4 leading-[1.15]">
              Exclusive engagements,{" "}
              <span className="text-gold italic font-light">locked in.</span>
            </h1>

            <p className="text-base md:text-lg mb-8 leading-relaxed max-w-xl mx-auto text-white/60 font-light">
              AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
            </p>

            <p className="text-xs font-bold uppercase tracking-widest mb-4 text-gold/80">
              Get started as
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto w-full">
              {/* Freelancer card */}
              <button
                onClick={handleFreelancerSignup}
                className="group flex flex-col items-start gap-3 rounded-xl p-5 text-left transition-all duration-300 bg-white/5 border border-gold/20 backdrop-blur-md hover:bg-white/10 hover:border-gold/40 hover:shadow-2xl hover:shadow-gold/10"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-gold/10 group-hover:bg-gold/20 transition-colors">
                    <Briefcase className="h-5 w-5 text-gold" />
                  </div>
                  <ArrowRight className="h-4 w-4 transition-all duration-300 group-hover:translate-x-1 text-white/30 group-hover:text-gold" />
                </div>
                <div>
                  <p className="font-serif font-bold text-lg text-white">Freelancer</p>
                  <p className="text-sm mt-1 leading-relaxed text-white/50 font-light">
                    Find exclusive, verified engagements and showcase your expertise.
                  </p>
                </div>
              </button>

              {/* Employer card — gold tint */}
              <button
                onClick={handleEmployerSignup}
                className="group flex flex-col items-start gap-3 rounded-xl p-5 text-left transition-all duration-300 bg-gold/10 border border-gold/30 backdrop-blur-md hover:bg-gold/15 hover:border-gold/50 hover:shadow-2xl hover:shadow-gold/20"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="h-11 w-11 rounded-lg flex items-center justify-center bg-gold/20 group-hover:bg-gold/30 transition-colors">
                    <Building2 className="h-5 w-5 text-gold" />
                  </div>
                  <ArrowRight className="h-4 w-4 transition-all duration-300 group-hover:translate-x-1 text-gold/70 group-hover:text-gold" />
                </div>
                <div>
                  <p className="font-serif font-bold text-lg text-white">Employer</p>
                  <p className="text-sm mt-1 leading-relaxed text-white/60 font-light">
                    Book elite, AI-matched talent with guaranteed exclusivity and legal agreements.
                  </p>
                </div>
              </button>
            </div>

            <p className="mt-6 text-sm text-white/40">
              {registrationIncomplete ? (
                <>
                  Need a different account?{" "}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="font-medium text-white/70 hover:text-white transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/sign-in" className="font-medium text-white/70 hover:text-white transition-colors">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        </section>
      </div>

      <main>
        {/* Features — warm cream */}
        <section className="py-24 px-6 bg-background relative">
          <div className="max-w-5xl mx-auto animate-fade-in">
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-16 text-muted-foreground">
              Why TalentLock
            </p>
            <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
              {[
                {
                  icon: Zap,
                  title: "AI-Powered Matching",
                  desc: "Describe your requirements in plain English. Our AI analyzes profiles and surfaces the perfect candidates with high precision.",
                },
                {
                  icon: Lock,
                  title: "Guaranteed Exclusivity",
                  desc: "When a professional is booked, they are locked in. Their profile prominently displays their unavailability, ensuring dedicated focus.",
                },
                {
                  icon: FileSignature,
                  title: "Automated Legal",
                  desc: "Every booking automatically generates a comprehensive, legally binding agreement ready for digital signature by both parties.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex flex-col items-center text-center group">
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-6 bg-primary text-gold shadow-lg shadow-primary/10 transition-transform duration-300 group-hover:-translate-y-2">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-serif font-semibold mb-3 text-foreground">{title}</h3>
                  <p className="leading-relaxed text-sm text-muted-foreground font-light">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-10 px-6 text-center text-sm bg-background border-t border-border text-muted-foreground">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <BrandLogo variant="onLight" size="sm" />
          </div>
          <p className="font-light">&copy; {new Date().getFullYear()} TalentLock. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
