import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useUpsertMe, useCreateFreelancerProfile, useUpsertMyEmployerProfile, usePatchOnboardingStep } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Building, CheckCircle, GraduationCap, Laptop, Loader2 } from "lucide-react";
import { FIELDS_OF_WORK, isFieldOfWork } from "@/lib/fields";
import { Badge } from "@/components/ui/badge";
import { ResumeImporter, type ParsedResume } from "@/components/ResumeImporter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import TeachingDetailsSection, { emptyTeachingDetails, type TeachingDetailsValues } from "@/components/onboarding/TeachingDetailsSection";
import { cn } from "@/lib/utils";
import type { EducationProfessionType, ProfessionCategory, PatchOnboardingStepBodyOnboardingStep } from "@workspace/api-client-react";

type OnboardingUiStep = "role" | "profession_category" | "freelancer-details" | "employer-details";

function toApiOnboardingStep(step: OnboardingUiStep): PatchOnboardingStepBodyOnboardingStep {
  if (step === "freelancer-details") return "freelancer_details";
  if (step === "employer-details") return "employer_details";
  return step;
}

function toUiOnboardingStep(step: string | null | undefined): OnboardingUiStep | null {
  if (step === "freelancer_details") return "freelancer-details";
  if (step === "employer_details") return "employer-details";
  if (step === "profession_category") return "profession_category";
  if (step === "role") return "role";
  return null;
}

function getIntendedRole(): "freelancer" | "employer" | null {
  const val = localStorage.getItem("talentlock_intended_role");
  if (val === "freelancer" || val === "employer") return val;
  return null;
}
function clearIntendedRole() {
  localStorage.removeItem("talentlock_intended_role");
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();

  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe();
  const upsertMe = useUpsertMe();
  const createFreelancerProfile = useCreateFreelancerProfile();
  const upsertEmployerProfile = useUpsertMyEmployerProfile();
  const patchOnboardingStep = usePatchOnboardingStep();

  const [step, setStep] = useState<OnboardingUiStep>("role");
  const [role, setRole] = useState<"freelancer" | "employer" | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

  // Profession category (freelancers only)
  const [professionCategory, setProfessionCategory] = useState<ProfessionCategory | null>(null);
  const [educationProfessionType, setEducationProfessionType] = useState<EducationProfessionType | null>(null);
  const [teachingDetails, setTeachingDetails] = useState<TeachingDetailsValues>(emptyTeachingDetails());

  // Freelancer fields
  const [tagline, setTagline] = useState("");
  const [fieldOfWork, setFieldOfWork] = useState("");
  const [skills, setSkills] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [paymentPreference, setPaymentPreference] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");

  const handleResumeParsed = async (data: ParsedResume) => {
    // Fill fields for display
    if (data.tagline) setTagline(data.tagline);
    if (isFieldOfWork(data.fieldOfWork)) setFieldOfWork(data.fieldOfWork);
    if (data.skills?.length) setSkills(data.skills.join(", "));
    if (data.yearsExperience) setYearsExperience(String(data.yearsExperience));
    if (data.paymentPreference) setPaymentPreference(data.paymentPreference);
    if (data.hourlyRate) setHourlyRate(String(data.hourlyRate));

    // Auto-create the profile immediately using the parsed data directly
    if (!user) return;
    setAutoCreating(true);
    try {
      await upsertMe.mutateAsync({
        data: {
          role: "freelancer",
          email: user.primaryEmailAddress?.emailAddress || "",
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      await createFreelancerProfile.mutateAsync({
        data: {
          tagline: data.tagline || "",
          fieldOfWork: isFieldOfWork(data.fieldOfWork) ? data.fieldOfWork : FIELDS_OF_WORK[0],
          skills: data.skills?.slice(0, 15) ?? [],
          yearsExperience: data.yearsExperience ?? 0,
          paymentPreference: data.paymentPreference || "hourly",
          hourlyRate: data.hourlyRate ?? null,
          subscriptionPlan: "basic",
          resumeAnalysis: data.resumeAnalysis ?? null,
        },
      });
      toast({ title: "Profile created!", description: "Your profile was built from your resume. Verify your identity anytime from Profile." });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Could not auto-create profile", description: "Your fields are filled in — review them and click Next.", variant: "destructive" });
    } finally {
      setAutoCreating(false);
    }
  };

  // Employer fields
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const intended = getIntendedRole();
    if (intended && !dbUser?.onboardingStep) {
      setRole(intended);
      setStep(intended === "freelancer" ? "profession_category" : "employer-details");
      clearIntendedRole();
    }
  }, [dbUser?.onboardingStep]);

  useEffect(() => {
    if (!dbUser || dbUser.role !== "pending") return;
    if (dbUser.onboardingRole === "freelancer" || dbUser.onboardingRole === "employer") {
      setRole(dbUser.onboardingRole);
    }
    const resumed = toUiOnboardingStep(dbUser.onboardingStep);
    if (resumed && resumed !== "role") {
      setStep(resumed);
    }
  }, [dbUser]);

  const persistOnboardingStep = async (
    onboardingRole: "freelancer" | "employer",
    nextStep: OnboardingUiStep,
  ) => {
    if (!user) return;
    await patchOnboardingStep.mutateAsync({
      data: {
        onboardingRole,
        onboardingStep: toApiOnboardingStep(nextStep),
        email: user.primaryEmailAddress?.emailAddress || "",
        name: user.fullName || "",
        avatarUrl: user.imageUrl ?? null,
      },
    });
  };

  // Redirect already-onboarded users away from this page
  useEffect(() => {
    if (dbUser && dbUser.role && dbUser.role !== "pending") {
      setLocation("/dashboard");
    }
  }, [dbUser, setLocation]);

  if (isLoadingUser && !isMeError) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (dbUser && dbUser.role && dbUser.role !== "pending") {
    return null;
  }

  const handleRoleSelection = async (selectedRole: "freelancer" | "employer") => {
    const nextStep: OnboardingUiStep =
      selectedRole === "freelancer" ? "profession_category" : "employer-details";
    setRole(selectedRole);
    setStep(nextStep);
    try {
      await persistOnboardingStep(selectedRole, nextStep);
    } catch {
      toast({
        title: "Could not save progress",
        description: "Your selection was kept on this device. Try again if you switch devices.",
        variant: "destructive",
      });
    }
  };

  const buildTeachingPayload = () => {
    if (professionCategory !== "education") return { professionCategory: "technology" as const };
    return {
      professionCategory: "education" as const,
      educationProfessionType: educationProfessionType ?? undefined,
      teachingSubjects: teachingDetails.teachingSubjects.length ? teachingDetails.teachingSubjects : undefined,
      teachingLevels: teachingDetails.teachingLevels.length ? teachingDetails.teachingLevels : undefined,
      yearsTeachingExperience: teachingDetails.yearsTeachingExperience ?? undefined,
      highestDegree: teachingDetails.highestDegree ?? undefined,
      degreeSubject: teachingDetails.degreeSubject || undefined,
      degreeInstitution: teachingDetails.degreeInstitution || undefined,
      teachingLicenceState: teachingDetails.teachingLicenceState || undefined,
      teachingLicenceExpiry: teachingDetails.teachingLicenceExpiry
        ? new Date(teachingDetails.teachingLicenceExpiry).toISOString()
        : undefined,
      researchPublications: teachingDetails.researchPublications || undefined,
      preferredTeachingMode: teachingDetails.preferredTeachingMode ?? undefined,
      location: teachingDetails.location || undefined,
    };
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
        },
      });
      await createFreelancerProfile.mutateAsync({
        data: {
          tagline,
          fieldOfWork,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
          yearsExperience: parseInt(yearsExperience, 10),
          paymentPreference,
          hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
          subscriptionPlan: "basic",
          ...buildTeachingPayload(),
        },
      });
      toast({
        title: "Profile created",
        description: "Welcome to TalentLock. Verify your identity anytime from Profile.",
      });
      setLocation("/dashboard");
    } catch {
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
        },
      });
      await upsertEmployerProfile.mutateAsync({
        data: {
          companyName,
          industry,
          companySize,
          description,
          subscriptionPlan: "basic",
        },
      });
      toast({ title: "Profile created", description: "Welcome to TalentLock." });
      setLocation("/dashboard");
    } catch {
      toast({ title: "Error", description: "Could not create profile. Please try again.", variant: "destructive" });
    }
  };

  const isEmployerPath = role === "employer" || step === "employer-details";
  const stepConfig = isEmployerPath
    ? [
        { n: 1, label: "Account type", active: step === "role" },
        { n: 2, label: "Profile details", active: step === "employer-details" },
      ]
    : [
        { n: 1, label: "Account type", active: step === "role" },
        { n: 2, label: "Work category", active: step === "profession_category" },
        { n: 3, label: "Profile details", active: step === "freelancer-details" },
      ];
  const progressStep =
    step === "role"
      ? 1
      : step === "profession_category"
        ? 2
        : step === "employer-details"
          ? 2
          : 3;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Complete Your Registration</h1>
        <p className="text-muted-foreground mt-2">Just a few steps to set up your TalentLock profile.</p>
      </div>

      {/* ── Account info banner ─────────────────────────────────────────── */}
      {user && (
        <div className="mb-6 rounded-lg border bg-card px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: "rgba(201,168,76,0.4)" }}>
            {user.imageUrl ? (
              <img src={user.imageUrl} alt={user.fullName || ""} className="h-9 w-9 object-cover" />
            ) : (
              <div className="h-9 w-9 flex items-center justify-center bg-primary/10 text-primary font-bold text-sm">
                {(user.fullName || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user.fullName || "Your Account"}</p>
            <p className="text-xs text-muted-foreground truncate">{user.primaryEmailAddress?.emailAddress}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>
            Signed in
          </span>
        </div>
      )}

      {/* ── Step indicator ──────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2">
          {stepConfig.map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={
                    progressStep > n
                      ? { backgroundColor: "#c9a84c", color: "#0d1f3c" }
                      : progressStep === n
                      ? { backgroundColor: "#0d1f3c", color: "#c9a84c", border: "2px solid #c9a84c" }
                      : { backgroundColor: "transparent", color: "rgba(255,255,255,0.3)", border: "2px solid rgba(255,255,255,0.15)" }
                  }
                >
                  {progressStep > n ? "✓" : n}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${progressStep >= n ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              {i < stepConfig.length - 1 && (
                <div className="flex-1 h-px mx-2" style={{ backgroundColor: progressStep > n ? "#c9a84c" : "rgba(255,255,255,0.1)" }} />
              )}
            </div>
          ))}
        </div>

      {/* ── Role selection ──────────────────────────────────────────────── */}
      {step === "role" && (
        <>
          <p className="text-center text-sm text-muted-foreground mb-6">Choose your account type to continue</p>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("freelancer")}>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Briefcase className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>I am a Freelancer</CardTitle>
                <CardDescription>I want to find exclusive, verified engagements.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Build a verified professional profile</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Get matched to exclusive roles via AI</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Sign binding agreements digitally</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleRoleSelection("employer")}>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                  <Building className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>I am an Employer</CardTitle>
                <CardDescription>I want to book high-end talent for my projects.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> AI-match talent to your requirements</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Guarantee exclusivity with bookings</li>
                  <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-primary shrink-0" /> Auto-generate legal agreements</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Profession category (freelancers only) ─────────────────────── */}
      {step === "profession_category" && (
        <Card>
          <CardHeader>
            <CardTitle>What kind of work do you do?</CardTitle>
            <CardDescription>This helps us show you the right opportunities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setProfessionCategory("technology")}
                className={cn(
                  "rounded-lg border-2 p-5 text-left transition-colors",
                  professionCategory === "technology"
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <Laptop className="h-6 w-6 mb-2 text-slate-600" />
                <p className="font-semibold text-slate-800">Technology</p>
                <p className="text-sm text-slate-500 mt-1">Software development, design, data, DevOps</p>
              </button>
              <button
                type="button"
                onClick={() => setProfessionCategory("education")}
                className={cn(
                  "rounded-lg border-2 p-5 text-left transition-colors",
                  professionCategory === "education"
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <GraduationCap className="h-6 w-6 mb-2 text-slate-600" />
                <p className="font-semibold text-slate-800">Education</p>
                <p className="text-sm text-slate-500 mt-1">Teaching, tutoring, lecturing, research</p>
              </button>
            </div>

            {professionCategory === "education" && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <p className="text-sm font-medium text-slate-700 mb-3">What best describes you?</p>
                <RadioGroup
                  value={educationProfessionType ?? ""}
                  onValueChange={(v) => setEducationProfessionType(v as EducationProfessionType)}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="school_teacher" id="school_teacher" />
                    <Label htmlFor="school_teacher" className="font-normal cursor-pointer">School Teacher (K-12 / Secondary)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="university_lecturer" id="university_lecturer" />
                    <Label htmlFor="university_lecturer" className="font-normal cursor-pointer">University Lecturer / Professor</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="tutor" id="tutor" />
                    <Label htmlFor="tutor" className="font-normal cursor-pointer">Private Tutor</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="researcher" id="researcher" />
                    <Label htmlFor="researcher" className="font-normal cursor-pointer">Researcher</Label>
                  </div>
                </RadioGroup>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); }}>Back</Button>
            <Button
              type="button"
              disabled={!professionCategory || (professionCategory === "education" && !educationProfessionType)}
              onClick={async () => {
                setStep("freelancer-details");
                if (role === "freelancer") {
                  try {
                    await persistOnboardingStep("freelancer", "freelancer-details");
                  } catch {
                    toast({
                      title: "Could not save progress",
                      description: "Continue on this device — progress may not sync.",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              Continue →
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Freelancer details ──────────────────────────────────────────── */}
      {step === "freelancer-details" && (
        <Card className="relative">
          {autoCreating && (
            <div className="absolute inset-0 z-10 rounded-lg flex flex-col items-center justify-center gap-3 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,31,60,0.85)" }}>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-base font-semibold text-foreground">Creating your profile…</p>
              <p className="text-sm text-muted-foreground">AI is building your profile from your resume</p>
            </div>
          )}
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Freelancer Profile</CardTitle>
                <CardDescription>Upload your resume to auto-create your profile instantly.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleFreelancerSubmit}>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed border-[#c9a84c]/40 bg-[#c9a84c]/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Auto-create Profile from Resume</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>AI</span>
                </div>
                <p className="text-xs text-muted-foreground">Upload your resume and AI will instantly create your profile and move you to the next step. Or fill the fields below manually.</p>
                <ResumeImporter onParsed={handleResumeParsed} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tagline">Professional Tagline</Label>
                <Input id="tagline" placeholder="e.g. Senior Full-Stack Engineer" value={tagline} onChange={(e) => setTagline(e.target.value)} required />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldOfWork">Primary Field</Label>
                  <Select value={fieldOfWork} onValueChange={setFieldOfWork} required>
                    <SelectTrigger id="fieldOfWork">
                      <SelectValue placeholder="Select your primary field" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {FIELDS_OF_WORK.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsExperience">Years of Experience</Label>
                  <Input id="yearsExperience" type="number" min="0" placeholder="e.g. 5" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma separated)</Label>
                <Input id="skills" placeholder="React, TypeScript, Node.js" value={skills} onChange={(e) => setSkills(e.target.value)} required />
              </div>
              {professionCategory === "education" && (
                <TeachingDetailsSection
                  educationProfessionType={educationProfessionType}
                  values={teachingDetails}
                  onChange={setTeachingDetails}
                />
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentPreference">Payment Preference</Label>
                  <Select value={paymentPreference} onValueChange={setPaymentPreference}>
                    <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly Rate</SelectItem>
                      <SelectItem value="daily">Daily Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate (USD)</Label>
                  <Input id="rate" type="number" min="0" placeholder="e.g. 150" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("profession_category")}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || createFreelancerProfile.isPending}>
                {createFreelancerProfile.isPending ? "Saving..." : "Create Profile →"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* ── Employer details ────────────────────────────────────────────── */}
      {step === "employer-details" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Building className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Employer Profile</CardTitle>
                <CardDescription>Tell us about your company and hiring needs.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleEmployerSubmit}>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" placeholder="Acme Inc." value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input id="industry" placeholder="Technology" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companySize">Company Size</Label>
                <Select value={companySize} onValueChange={setCompanySize}>
                  <SelectTrigger><SelectValue placeholder="Select company size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1–10 employees</SelectItem>
                    <SelectItem value="11-50">11–50 employees</SelectItem>
                    <SelectItem value="51-200">51–200 employees</SelectItem>
                    <SelectItem value="201-500">201–500 employees</SelectItem>
                    <SelectItem value="500+">500+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Company Description</Label>
                <Textarea id="description" placeholder="Briefly describe what your company does..." value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); }}>Back</Button>
              <Button type="submit" disabled={upsertMe.isPending || upsertEmployerProfile.isPending}>
                {upsertEmployerProfile.isPending ? "Saving..." : "Create Profile →"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
