import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
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
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* Header — deep navy */}
      <header
        className="sticky top-0 z-50 px-6 h-16 flex items-center justify-between"
        style={{ backgroundColor: "hsl(var(--primary))", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-gold" />
          <span className="font-serif font-semibold text-lg tracking-tight text-white">TalentLock</span>
        </div>
        <Link
          href="/sign-in"
          className="text-sm font-medium transition-colors text-white/70 hover:text-white"
        >
          Sign In
        </Link>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero — navy gradient with subtle grid */}
        <section
          className="relative overflow-hidden py-24 md:py-32 px-6 flex flex-col items-center text-center"
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
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-semibold uppercase tracking-widest bg-gold/10 text-gold border border-gold/20 backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
              Premium Talent Platform
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-white mb-6 leading-tight">
              Exclusive engagements,{" "}
              <span className="text-gold italic font-light">locked in.</span>
            </h1>

            <p className="text-lg md:text-xl mb-14 leading-relaxed max-w-xl mx-auto text-white/60 font-light">
              AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
            </p>

            <p className="text-xs font-bold uppercase tracking-widest mb-6 text-gold/80">
              Get started as
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto w-full">
              {/* Freelancer card */}
              <button
                onClick={handleFreelancerSignup}
                className="group flex flex-col items-start gap-4 rounded-xl p-7 text-left transition-all duration-300 bg-white/5 border border-gold/20 backdrop-blur-md hover:bg-white/10 hover:border-gold/40 hover:shadow-2xl hover:shadow-gold/10"
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
                className="group flex flex-col items-start gap-4 rounded-xl p-7 text-left transition-all duration-300 bg-gold/10 border border-gold/30 backdrop-blur-md hover:bg-gold/15 hover:border-gold/50 hover:shadow-2xl hover:shadow-gold/20"
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

            <p className="mt-10 text-sm text-white/40">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-white/70 hover:text-white transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </section>

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
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gold" />
            <span className="font-serif font-semibold text-foreground">TalentLock</span>
          </div>
          <p className="font-light">&copy; {new Date().getFullYear()} TalentLock. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
