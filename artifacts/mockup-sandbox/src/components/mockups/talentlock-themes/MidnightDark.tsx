import { Briefcase, Building2, ArrowRight, Shield, Lock, FileSignature, Zap } from "lucide-react";

export function MidnightDark() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#09090b" }} className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-8 h-16 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5" style={{ color: "#2dd4bf" }} />
          <span className="font-bold text-lg tracking-tight text-white">TalentLock</span>
        </div>
        <span className="text-sm cursor-pointer" style={{ color: "#71717a" }}>Sign In</span>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center relative overflow-hidden">
        {/* glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse, #2dd4bf 0%, transparent 70%)" }} />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-medium"
            style={{ backgroundColor: "rgba(45,212,191,0.1)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Now in beta · Join the waitlist
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Exclusive engagements,{" "}
            <span style={{ color: "#2dd4bf" }}>locked in.</span>
          </h1>
          <p className="text-lg mb-12 leading-relaxed max-w-xl mx-auto" style={{ color: "#a1a1aa" }}>
            AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
          </p>

          <p className="text-xs uppercase tracking-widest mb-5" style={{ color: "#52525b" }}>Continue as</p>

          <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto">
            <button className="group flex flex-col items-start gap-4 rounded-xl p-6 text-left transition-all duration-200"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(45,212,191,0.12)" }}>
                  <Briefcase className="h-5 w-5" style={{ color: "#2dd4bf" }} />
                </div>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: "#52525b" }} />
              </div>
              <div>
                <p className="font-semibold text-sm text-white">Freelancer</p>
                <p className="text-xs mt-0.5" style={{ color: "#71717a" }}>Find exclusive engagements</p>
              </div>
            </button>
            <button className="group flex flex-col items-start gap-4 rounded-xl p-6 text-left transition-all duration-200 relative overflow-hidden"
              style={{ backgroundColor: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.25)" }}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "radial-gradient(ellipse at top left, rgba(45,212,191,0.12), transparent)" }} />
              <div className="flex items-center justify-between w-full relative z-10">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(45,212,191,0.2)" }}>
                  <Building2 className="h-5 w-5" style={{ color: "#2dd4bf" }} />
                </div>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" style={{ color: "#2dd4bf" }} />
              </div>
              <div className="relative z-10">
                <p className="font-semibold text-sm text-white">Employer</p>
                <p className="text-xs mt-0.5" style={{ color: "#71717a" }}>Book AI-matched talent</p>
              </div>
            </button>
          </div>
          <p className="mt-6 text-sm" style={{ color: "#52525b" }}>
            Already have an account?{" "}
            <span className="font-medium cursor-pointer" style={{ color: "#2dd4bf" }}>Sign in</span>
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-14 px-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          {[
            { icon: Zap, title: "AI-Powered Matching", desc: "Natural language job matching with instant, high-precision results." },
            { icon: Lock, title: "Guaranteed Exclusivity", desc: "Booked professionals display a real-time lock badge on their profile." },
            { icon: FileSignature, title: "Automated Legal", desc: "Binding contracts auto-generated and signed inside the platform." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-start gap-3 p-5 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(45,212,191,0.12)" }}>
                <Icon className="h-4 w-4" style={{ color: "#2dd4bf" }} />
              </div>
              <div>
                <p className="font-semibold text-sm text-white mb-1">{title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "#71717a" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-5 px-8 text-center text-xs" style={{ color: "#3f3f46", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        © 2026 TalentLock · All rights reserved
      </footer>
    </div>
  );
}
