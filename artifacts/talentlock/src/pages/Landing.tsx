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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f7f4ef", fontFamily: "'Inter', sans-serif" }}>

      {/* Header — deep navy */}
      <header
        className="sticky top-0 z-50 px-6 h-16 flex items-center justify-between"
        style={{ backgroundColor: "#0d1f3c", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5" style={{ color: "#c9a84c" }} />
          <span className="font-bold text-lg tracking-tight text-white">TalentLock</span>
        </div>
        <Link
          href="/sign-in"
          className="text-sm font-medium transition-colors"
          style={{ color: "rgba(255,255,255,0.65)" }}
        >
          Sign In
        </Link>
      </header>

      <main className="flex-1 flex flex-col">

        {/* Hero — navy gradient with subtle grid */}
        <section
          className="relative overflow-hidden py-24 md:py-32 px-6 flex flex-col items-center text-center"
          style={{ background: "linear-gradient(160deg, #0d1f3c 0%, #142b54 55%, #0d1f3c 100%)" }}
        >
          {/* Grid texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(rgba(201,168,76,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.07) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          <div className="relative z-10 max-w-3xl mx-auto">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-semibold uppercase tracking-widest"
              style={{
                backgroundColor: "rgba(201,168,76,0.13)",
                color: "#c9a84c",
                border: "1px solid rgba(201,168,76,0.28)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#c9a84c" }} />
              Premium Talent Platform
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-white mb-6 leading-tight">
              Exclusive engagements,{" "}
              <span style={{ color: "#c9a84c" }}>locked in.</span>
            </h1>

            <p className="text-lg md:text-xl mb-14 leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.62)" }}>
              AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
            </p>

            <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: "#c9a84c" }}>
              Get started as
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto w-full">
              {/* Freelancer card */}
              <button
                onClick={handleFreelancerSignup}
                className="group flex flex-col items-start gap-4 rounded-xl p-7 text-left transition-all duration-200"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(201,168,76,0.25)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div
                    className="h-11 w-11 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "rgba(201,168,76,0.14)" }}
                  >
                    <Briefcase className="h-5 w-5" style={{ color: "#c9a84c" }} />
                  </div>
                  <ArrowRight className="h-4 w-4 transition-all duration-200 group-hover:translate-x-1" style={{ color: "rgba(255,255,255,0.35)" }} />
                </div>
                <div>
                  <p className="font-bold text-base text-white">Freelancer</p>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                    Find exclusive, verified engagements and showcase your expertise.
                  </p>
                </div>
              </button>

              {/* Employer card — gold tint */}
              <button
                onClick={handleEmployerSignup}
                className="group flex flex-col items-start gap-4 rounded-xl p-7 text-left transition-all duration-200"
                style={{
                  backgroundColor: "rgba(201,168,76,0.11)",
                  border: "1px solid rgba(201,168,76,0.4)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div
                    className="h-11 w-11 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: "rgba(201,168,76,0.22)" }}
                  >
                    <Building2 className="h-5 w-5" style={{ color: "#c9a84c" }} />
                  </div>
                  <ArrowRight className="h-4 w-4 transition-all duration-200 group-hover:translate-x-1" style={{ color: "#c9a84c" }} />
                </div>
                <div>
                  <p className="font-bold text-base text-white">Employer</p>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.52)" }}>
                    Book elite, AI-matched talent with guaranteed exclusivity and legal agreements.
                  </p>
                </div>
              </button>
            </div>

            <p className="mt-8 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-white hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>

        {/* Features — warm cream */}
        <section className="py-24 px-6" style={{ backgroundColor: "#f7f4ef" }}>
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-14" style={{ color: "rgba(13,31,60,0.35)" }}>
              Why TalentLock
            </p>
            <div className="grid md:grid-cols-3 gap-12">
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
                <div key={title} className="flex flex-col items-center text-center">
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: "#0d1f3c" }}
                  >
                    <Icon className="h-8 w-8" style={{ color: "#c9a84c" }} />
                  </div>
                  <h3 className="text-lg font-bold mb-3" style={{ color: "#0d1f3c" }}>{title}</h3>
                  <p className="leading-relaxed text-sm" style={{ color: "rgba(13,31,60,0.58)" }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className="py-8 px-6 text-center text-sm"
        style={{ backgroundColor: "#f7f4ef", borderTop: "1px solid rgba(13,31,60,0.1)", color: "rgba(13,31,60,0.42)" }}
      >
        &copy; {new Date().getFullYear()} TalentLock. All rights reserved.
      </footer>
    </div>
  );
}
