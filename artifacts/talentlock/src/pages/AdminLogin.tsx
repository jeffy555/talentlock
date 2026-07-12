import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getAdminCsrfToken } from "@/lib/adminCsrf";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BrandLogo } from "@/components/BrandLogo";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    getAdminCsrfToken()
      .then(setCsrfToken)
      .catch(() => setCsrfToken(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = csrfToken ?? (await getAdminCsrfToken());
      const res = await fetch(`${basePath}/api/admin/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Invalid credentials.");
      }
      toast({ title: "Welcome back", description: "Admin session started." });
      setLocation("/admin");
    } catch (err: any) {
      toast({
        title: "Sign-in failed",
        description: err?.message ?? "Could not sign in.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-primary/10 shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto mb-1">
            <BrandLogo variant="onLight" size="lg" />
          </div>
          <CardTitle className="font-serif text-2xl">Admin Console</CardTitle>
          <CardDescription>Sign in to view platform activity</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-user">Username</Label>
              <Input
                id="admin-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-pass">Password</Label>
              <Input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !csrfToken}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Admin access is restricted. All sign-in attempts are logged.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
