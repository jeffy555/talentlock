import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Link, Redirect } from "wouter";
import { Shield, Lock, FileSignature, Zap } from "lucide-react";

export default function Landing() {
  const { isLoaded, isSignedIn } = useUser();
  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe({ 
    query: { enabled: !!isSignedIn } as any
  });

  if (isLoaded && isSignedIn && (!isLoadingUser || isMeError)) {
    if (!dbUser) {
      return <Redirect to="/onboarding" />;
    }
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">TalentLock</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Button asChild>
              <Link href="/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="py-20 md:py-32 px-4 text-center max-w-4xl mx-auto flex-1 flex flex-col justify-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-foreground mb-6">
            Exclusive engagements, <span className="text-primary">locked in.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            TalentLock is the precision booking system for serious professionals. AI-matched requirements, legally binding agreements, and guaranteed exclusivity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-lg" asChild>
              <Link href="/sign-up">Create an Account</Link>
            </Button>
          </div>
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
