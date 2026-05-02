import { useState } from "react";
import { useLocation } from "wouter";
import { useGetMe, useUpsertMe, useCreateFreelancerProfile, useUpsertMyEmployerProfile } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Building } from "lucide-react";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  
  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe();
  const upsertMe = useUpsertMe();
  const createFreelancerProfile = useCreateFreelancerProfile();
  const upsertEmployerProfile = useUpsertMyEmployerProfile();

  const [step, setStep] = useState<"role" | "freelancer-details" | "employer-details">("role");
  const [role, setRole] = useState<"freelancer" | "employer" | null>(null);

  // Freelancer state
  const [tagline, setTagline] = useState("");
  const [fieldOfWork, setFieldOfWork] = useState("");
  const [skills, setSkills] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [paymentPreference, setPaymentPreference] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");

  // Employer state
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");

  if (isLoadingUser && !isMeError) {
    return <div className="flex h-[50vh] items-center justify-center"><div className="animate-pulse flex flex-col items-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-muted-foreground">Loading profile...</p></div></div>;
  }

  // If already onboarded, redirect
  if (dbUser && dbUser.role && dbUser.role !== "pending") {
    // Actually we can check if they have a profile, but role is good enough for now
    // Wait, the API spec says role is string.
  }

  const handleRoleSelection = async (selectedRole: "freelancer" | "employer") => {
    setRole(selectedRole);
    setStep(selectedRole === "freelancer" ? "freelancer-details" : "employer-details");
  };

  const handleFreelancerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await upsertMe.mutateAsync({
        data: {
          role: "freelancer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        }
      });

      await createFreelancerProfile.mutateAsync({
        data: {
          tagline,
          fieldOfWork,
          skills: skills.split(",").map(s => s.trim()).filter(Boolean),
          yearsExperience: parseInt(yearsExperience, 10),
          paymentPreference,
          hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
          subscriptionPlan: "basic"
        }
      });

      toast({ title: "Profile created", description: "Welcome to TalentLock." });
      setLocation("/dashboard");
    } catch (error) {
      toast({ title: "Error", description: "Could not create profile. Please try again.", variant: "destructive" });
    }
  };

  const handleEmployerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await upsertMe.mutateAsync({
        data: {
          role: "employer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        }
      });

      await upsertEmployerProfile.mutateAsync({
        data: {
          companyName,
          industry,
          companySize,
          description,
          subscriptionPlan: "basic"
        }
      });

      toast({ title: "Profile created", description: "Welcome to TalentLock." });
      setLocation("/dashboard");
    } catch (error) {
      toast({ title: "Error", description: "Could not create profile. Please try again.", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome to TalentLock</h1>
        <p className="text-muted-foreground mt-2">Let's set up your profile to get started.</p>
      </div>

      {step === "role" && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("freelancer")}>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Briefcase className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>I am a Freelancer</CardTitle>
              <CardDescription>I want to find exclusive, verified engagements.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("employer")}>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <Building className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>I am an Employer</CardTitle>
              <CardDescription>I want to book high-end talent for my projects.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {step === "freelancer-details" && (
        <Card>
          <CardHeader>
            <CardTitle>Freelancer Profile</CardTitle>
            <CardDescription>Tell us about your expertise and skills.</CardDescription>
          </CardHeader>
          <form onSubmit={handleFreelancerSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tagline">Professional Tagline</Label>
                <Input id="tagline" placeholder="e.g. Senior Full-Stack Engineer" value={tagline} onChange={e => setTagline(e.target.value)} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldOfWork">Primary Field</Label>
                  <Input id="fieldOfWork" placeholder="e.g. Software Engineering" value={fieldOfWork} onChange={e => setFieldOfWork(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsExperience">Years of Experience</Label>
                  <Input id="yearsExperience" type="number" min="0" placeholder="e.g. 5" value={yearsExperience} onChange={e => setYearsExperience(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma separated)</Label>
                <Input id="skills" placeholder="React, TypeScript, Node.js" value={skills} onChange={e => setSkills(e.target.value)} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentPreference">Payment Preference</Label>
                  <Select value={paymentPreference} onValueChange={setPaymentPreference}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select preference" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly Rate</SelectItem>
                      <SelectItem value="daily">Daily Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate (USD)</Label>
                  <Input id="rate" type="number" min="0" placeholder="e.g. 150" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} required />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("role")}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || createFreelancerProfile.isPending}>
                {createFreelancerProfile.isPending ? "Saving..." : "Complete Profile"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "employer-details" && (
        <Card>
          <CardHeader>
            <CardTitle>Employer Profile</CardTitle>
            <CardDescription>Tell us about your company and hiring needs.</CardDescription>
          </CardHeader>
          <form onSubmit={handleEmployerSubmit}>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" placeholder="Acme Inc." value={companyName} onChange={e => setCompanyName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input id="industry" placeholder="Technology" value={industry} onChange={e => setIndustry(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companySize">Company Size</Label>
                <Select value={companySize} onValueChange={setCompanySize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10 employees</SelectItem>
                    <SelectItem value="11-50">11-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="201-500">201-500 employees</SelectItem>
                    <SelectItem value="500+">500+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Company Description</Label>
                <Textarea id="description" placeholder="Briefly describe what your company does..." value={description} onChange={e => setDescription(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("role")}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || upsertEmployerProfile.isPending}>
                {upsertEmployerProfile.isPending ? "Saving..." : "Complete Profile"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
