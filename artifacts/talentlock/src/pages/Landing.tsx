import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, Redirect, useLocation } from "wouter";
import { Shield, Lock, FileSignature, Zap, Briefcase, Building2, ArrowRight } from "lucide-react";

function setIntendedRole(role: "freelancer" | "employer") {
  localStorage.setItem("talentlock_intended_role", role);
}

export default function Landing() {
  const { isLoaded, isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe({
    query: { enabled: !!isSignedIn } as any,
  });

  if (isLoaded && isSignedIn && (!isLoadingUser || isMeError)) {
    if (!dbUser) {
      return <Redirect to="/onboarding" />;
    }
    return <Redirect to="/dashboard" />;
  }

  const handleFreelancerSignup = () => {
    setIntendedRole("freelancer");
    setLocation("/sign-up");
  };

  const handleEmployerSignup = () => {
    setIntendedRole("employer");
    setLocation("/sign-up");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">TalentLock</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="py-20 md:py-28 px-4 text-center max-w-4xl mx-auto flex-1 flex flex-col justify-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-foreground mb-6">
            Exclusive engagements,{" "}
            <span className="text-primary">locked in.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-14 max-w-2xl mx-auto leading-relaxed">
            TalentLock is the precision booking system for serious professionals. AI-matched requirements, legally binding agreements, and guaranteed exclusivity.
          </p>

          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            Get started as
          </p>

          <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto w-full">
            <button
              onClick={handleFreelancerSignup}
              className="group flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-7 text-left shadow-sm hover:border-primary hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Briefcase className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
              </div>
              <div>
                <p className="font-bold text-lg text-foreground">Freelancer</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Find exclusive, verified engagements and showcase your expertise.
                </p>
              </div>
            </button>

            <button
              onClick={handleEmployerSignup}
              className="group flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-card p-7 text-left shadow-sm hover:border-primary hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between w-full">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
              </div>
              <div>
                <p className="font-bold text-lg text-foreground">Employer</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Book elite, AI-matched talent with guaranteed exclusivity and legal agreements.
                </p>
              </div>
            </button>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </section>

        <section className="bg-secondary/30 py-24 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                  <Zap className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">AI-Powered Matching</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Describe your requirements in plain English. Our AI analyzes profiles and suggests the perfect candidates with high precision.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                  <Lock className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">Guaranteed Exclusivity</h3>
                <p className="text-muted-foreground leading-relaxed">
                  When a professional is booked, they are locked in. Their profile prominently displays their unavailability, ensuring dedicated focus.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary">
                  <FileSignature className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold mb-3">Automated Legal</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Every booking automatically generates a comprehensive, legally binding agreement ready for digital signature by both parties.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border bg-card">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} TalentLock. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
