import { Briefcase, Building2, ArrowRight, Shield, Lock, FileSignature, Zap, CheckCircle } from "lucide-react";

export function NavyGold() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#f7f4ef" }} className="min-h-screen flex flex-col">
      {/* Header */}
      <header style={{ backgroundColor: "#0d1f3c", borderBottom: "1px solid #1a3460" }} className="px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div style={{ color: "#c9a84c" }}>
            <Shield className="h-6 w-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">TalentLock</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-sm text-slate-300 cursor-pointer hover:text-white transition-colors">Sign In</span>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden py-20 px-8 text-center flex flex-col items-center"
        style={{ background: "linear-gradient(160deg, #0d1f3c 0%, #1a3460 60%, #0d1f3c 100%)" }}
      >
        {/* subtle grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }} />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-semibold uppercase tracking-widest"
            style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)" }}>
            <span>●</span> Premium Talent Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
            Exclusive engagements,{" "}
            <span style={{ color: "#c9a84c" }}>locked in.</span>
          </h1>
          <p className="text-lg text-slate-300 mb-12 leading-relaxed max-w-xl mx-auto">
            AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
          </p>

          <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: "#c9a84c" }}>Get started as</p>

          <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            <button className="group flex flex-col items-start gap-3 rounded-xl p-6 text-left transition-all duration-200"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(201,168,76,0.3)" }}>
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>
                  <Briefcase className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-amber-400 transition-colors" />
              </div>
              <div>
                <p className="font-bold text-white">Freelancer</p>
                <p className="text-xs text-slate-400 mt-0.5">Find exclusive, verified engagements</p>
              </div>
            </button>
            <button className="group flex flex-col items-start gap-3 rounded-xl p-6 text-left transition-all duration-200"
              style={{ backgroundColor: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.4)" }}>
              <div className="flex items-center justify-between w-full">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(201,168,76,0.2)", color: "#c9a84c" }}>
                  <Building2 className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4" style={{ color: "#c9a84c" }} />
              </div>
              <div>
                <p className="font-bold text-white">Employer</p>
                <p className="text-xs text-slate-400 mt-0.5">Book elite AI-matched talent</p>
              </div>
            </button>
          </div>

          <p className="mt-6 text-sm text-slate-400">
            Already have an account? <span className="font-medium text-white cursor-pointer hover:underline">Sign in</span>
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-8" style={{ backgroundColor: "#f7f4ef" }}>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          {[
            { icon: Zap, title: "AI-Powered Matching", desc: "Describe your needs in plain English. AI recommends the perfect match." },
            { icon: Lock, title: "Guaranteed Exclusivity", desc: "When booked, freelancers are locked in with a visible availability badge." },
            { icon: FileSignature, title: "Automated Legal", desc: "Every booking auto-generates a binding agreement ready to e-sign." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "#0d1f3c" }}>
                <Icon className="h-7 w-7" style={{ color: "#c9a84c" }} />
              </div>
              <h3 className="font-bold text-base mb-2" style={{ color: "#0d1f3c" }}>{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-8 border-t text-center text-xs text-slate-400" style={{ borderColor: "#e5ddd0", backgroundColor: "#f7f4ef" }}>
        © 2026 TalentLock · All rights reserved
      </footer>
    </div>
  );
}
