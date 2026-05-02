import { Briefcase, Building2, ArrowRight, Shield, Lock, FileSignature, Zap } from "lucide-react";

export function IndigoSlate() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#f8fafc" }} className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white px-8 h-16 flex items-center justify-between" style={{ borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" style={{ color: "#4f46e5" }} />
          <span className="font-bold text-lg tracking-tight" style={{ color: "#0f172a" }}>TalentLock</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium cursor-pointer" style={{ color: "#64748b" }}>Sign In</span>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-8 text-xs font-medium"
          style={{ backgroundColor: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe" }}>
          Trusted by 2,400+ professionals
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight max-w-2xl" style={{ color: "#0f172a" }}>
          Exclusive engagements,{" "}
          <span style={{ color: "#4f46e5" }}>locked in.</span>
        </h1>
        <p className="text-lg mb-12 max-w-lg leading-relaxed" style={{ color: "#64748b" }}>
          AI-matched requirements, legally binding agreements, and guaranteed exclusivity for serious professionals.
        </p>

        <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: "#94a3b8" }}>Choose your path</p>

        <div className="grid sm:grid-cols-2 gap-4 w-full max-w-lg">
          <button className="group flex flex-col items-start gap-4 rounded-2xl p-6 text-left transition-all duration-200 bg-white"
            style={{ border: "2px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between w-full">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#ede9fe" }}>
                <Briefcase className="h-5 w-5" style={{ color: "#7c3aed" }} />
              </div>
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#4f46e5" }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "#0f172a" }}>Freelancer</p>
              <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>Find exclusive engagements</p>
            </div>
          </button>
          <button className="group flex flex-col items-start gap-4 rounded-2xl p-6 text-left transition-all duration-200"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", border: "2px solid transparent", boxShadow: "0 4px 20px rgba(79,70,229,0.3)" }}>
            <div className="flex items-center justify-between w-full">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <ArrowRight className="h-4 w-4 text-white opacity-70" />
            </div>
            <div>
              <p className="font-bold text-sm text-white">Employer</p>
              <p className="text-xs mt-0.5 text-indigo-200">Book AI-matched talent</p>
            </div>
          </button>
        </div>
        <p className="mt-6 text-sm" style={{ color: "#94a3b8" }}>
          Already have an account? <span className="font-medium cursor-pointer hover:underline" style={{ color: "#4f46e5" }}>Sign in</span>
        </p>
      </section>

      {/* Features strip */}
      <section className="py-14 px-8 border-t" style={{ backgroundColor: "white", borderColor: "#e2e8f0" }}>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-10">
          {[
            { icon: Zap, label: "AI-Powered Matching", desc: "Natural language job matching with instant precision." },
            { icon: Lock, label: "Guaranteed Exclusivity", desc: "Booked professionals display a live exclusivity badge." },
            { icon: FileSignature, label: "Auto Legal Agreements", desc: "Binding contracts generated and signed in seconds." },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex gap-4 items-start">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm mb-1" style={{ color: "#0f172a" }}>{label}</p>
                <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-5 px-8 text-center text-xs" style={{ color: "#94a3b8", borderTop: "1px solid #e2e8f0" }}>
        © 2026 TalentLock · All rights reserved
      </footer>
    </div>
  );
}
