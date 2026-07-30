import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useUpsertMe,
  useCreateFreelancerProfile,
  useUpsertMyEmployerProfile,
  useGetMyEmployerProfile,
  usePatchOnboardingStep,
  useListCountries,
  getGetMeQueryKey,
  getGetMyEmployerProfileQueryKey,
  getGetDocumentsMeQueryKey,
} from "@workspace/api-client-react";
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
import { ResumeImporter, type ParsedResume } from "@/components/ResumeImporter";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import TeachingDetailsSection, { emptyTeachingDetails, type TeachingDetailsValues } from "@/components/onboarding/TeachingDetailsSection";
import { EmployerDocumentOnboardingStep } from "@/components/onboarding/EmployerDocumentOnboardingStep";
import { FreelancerDocumentOnboardingStep } from "@/components/onboarding/FreelancerDocumentOnboardingStep";
import {
  CountryStateFields,
  formatLocationLabel,
  isLocationComplete,
} from "@/components/onboarding/CountryStateFields";
import { PhoneWithCountryFields } from "@/components/onboarding/PhoneWithCountryFields";
import { isValidContactEmail, isValidContactPhone } from "@/lib/contactValidation";
import { cn } from "@/lib/utils";
import { COMPANY_SIZE_OPTIONS } from "@/lib/employerDocuments";
import type {
  EducationProfessionType,
  ProfessionCategory,
  PatchOnboardingStepBodyOnboardingStep,
} from "@workspace/api-client-react";

/** UI: role picker, then one registration form (all fields + verification). */
type OnboardingUiStep = "role" | "form";

function toApiOnboardingStep(step: OnboardingUiStep, role: "freelancer" | "employer"): PatchOnboardingStepBodyOnboardingStep {
  if (step === "role") return "role";
  return role === "freelancer" ? "freelancer_details" : "employer_details";
}

function mapServerStepToUi(step: string | null | undefined): OnboardingUiStep {
  if (!step || step === "role") return "role";
  // Any prior multi-step progress resumes on the single registration form.
  return "form";
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
  const queryClient = useQueryClient();

  const { data: dbUser, isLoading: isLoadingUser, isError: isMeError } = useGetMe();
  const upsertMe = useUpsertMe();
  const createFreelancerProfile = useCreateFreelancerProfile();
  const upsertEmployerProfile = useUpsertMyEmployerProfile();
  const patchOnboardingStep = usePatchOnboardingStep();
  const { data: countriesData } = useListCountries();
  const countries = countriesData?.countries ?? [];

  const [step, setStep] = useState<OnboardingUiStep>("role");
  const [role, setRole] = useState<"freelancer" | "employer" | null>(null);
  const [countryCode, setCountryCode] = useState("US");
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [docReady, setDocReady] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  const [professionCategory, setProfessionCategory] = useState<ProfessionCategory | null>("technology");
  const [educationProfessionType, setEducationProfessionType] = useState<EducationProfessionType | null>(null);
  const [teachingDetails, setTeachingDetails] = useState<TeachingDetailsValues>(emptyTeachingDetails());

  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [fieldOfWork, setFieldOfWork] = useState("");
  const [skills, setSkills] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [paymentPreference, setPaymentPreference] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const profileSavedRef = useRef(false);
  const emailSeededRef = useRef(false);
  const phoneSeededRef = useRef(false);

  const { data: existingEmployerProfile, isError: employerProfileError } = useGetMyEmployerProfile({
    query: {
      enabled: step === "form" && role === "employer" && !!user,
      retry: false,
    } as any,
  });

  const employerProfileLoadFailed =
    employerProfileError &&
    typeof employerProfileError === "object" &&
    "status" in employerProfileError &&
    (employerProfileError as { status: number }).status !== 404;

  useEffect(() => {
    if (!existingEmployerProfile) return;
    setCompanyName(existingEmployerProfile.companyName ?? "");
    setIndustry(existingEmployerProfile.industry ?? "");
    setCompanySize(existingEmployerProfile.companySize ?? "");
    setDescription(existingEmployerProfile.description ?? "");
    profileSavedRef.current = true;
  }, [existingEmployerProfile]);

  useEffect(() => {
    if (emailSeededRef.current) return;
    const fromDb = dbUser?.email && !dbUser.email.includes("@deleted.") ? dbUser.email : "";
    const fromClerk = user?.primaryEmailAddress?.emailAddress ?? "";
    const seed = fromDb || fromClerk;
    if (!seed) return;
    setContactEmail(seed);
    emailSeededRef.current = true;
  }, [dbUser?.email, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    if (phoneSeededRef.current) return;
    const fromDb = (dbUser as { phone?: string | null } | undefined)?.phone;
    if (!fromDb) return;
    setContactPhone(fromDb);
    phoneSeededRef.current = true;
  }, [(dbUser as { phone?: string | null } | undefined)?.phone]);

  useEffect(() => {
    const intended = getIntendedRole();
    if (!intended || dbUser?.onboardingStep || !user) return;
    clearIntendedRole();
    setRole(intended);
    void (async () => {
      try {
        const email = contactEmail || user.primaryEmailAddress?.emailAddress || "";
        if (!isValidContactEmail(email)) return;
        await patchOnboardingStep.mutateAsync({
          data: {
            onboardingRole: intended,
            onboardingStep: "role",
            email,
            ...(isValidContactPhone(contactPhone) ? { phone: contactPhone.trim() } : {}),
            name: user.fullName || "",
            avatarUrl: user.imageUrl ?? null,
          },
        });
      } catch {
        // Still show the form; progress may only live on this device.
      }
      setStep("form");
    })();
  }, [dbUser?.onboardingStep, user, patchOnboardingStep, contactEmail, contactPhone]);

  useEffect(() => {
    if (!dbUser || dbUser.role !== "pending") return;
    if (dbUser.onboardingRole === "freelancer" || dbUser.onboardingRole === "employer") {
      setRole(dbUser.onboardingRole);
    }
    const ui = mapServerStepToUi(dbUser.onboardingStep);
    if (ui === "form" && dbUser.onboardingRole) {
      setStep("form");
    }
    if (dbUser.countryCode) setCountryCode(dbUser.countryCode);
    if (dbUser.stateCode !== undefined) setStateCode(dbUser.stateCode);
  }, [dbUser]);

  const persistOnboardingStep = async (
    onboardingRole: "freelancer" | "employer",
    uiStep: OnboardingUiStep,
    location?: { countryCode: string; stateCode: string | null },
  ) => {
    if (!user) return;
    const email = contactEmail.trim() || user.primaryEmailAddress?.emailAddress || "";
    if (!isValidContactEmail(email)) {
      throw new Error("A valid contact email is required.");
    }
    await patchOnboardingStep.mutateAsync({
      data: {
        onboardingRole,
        onboardingStep: toApiOnboardingStep(uiStep, onboardingRole),
        email,
        ...(isValidContactPhone(contactPhone) ? { phone: contactPhone.trim() } : {}),
        name: user.fullName || "",
        avatarUrl: user.imageUrl ?? null,
        ...(location
          ? { countryCode: location.countryCode, stateCode: location.stateCode }
          : {}),
      },
    });
  };

  useEffect(() => {
    if (dbUser && dbUser.role && dbUser.role !== "pending") {
      setLocation("/dashboard");
    }
  }, [dbUser, setLocation]);

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
      location: formatLocationLabel(countries, countryCode, stateCode) || teachingDetails.location || undefined,
    };
  };

  const ensureFreelancerProfile = useCallback(async () => {
    if (!user || !isValidContactEmail(contactEmail)) {
      throw new Error("Enter a valid contact email first.");
    }
    if (!isValidContactPhone(contactPhone)) {
      throw new Error("Enter a valid phone number first (8–15 digits, optional + country code).");
    }
    if (!isLocationComplete(countries, countryCode, stateCode)) {
      throw new Error("Select your country and state before uploading documents.");
    }
    if (!professionCategory) {
      throw new Error("Select your work category before uploading documents.");
    }
    if (professionCategory === "education" && !educationProfessionType) {
      throw new Error("Select what best describes you in Education.");
    }
    await persistOnboardingStep("freelancer", "form", { countryCode, stateCode });
    await createFreelancerProfile.mutateAsync({
      data: {
        tagline: tagline || "Professional",
        bio: bio.trim() || null,
        fieldOfWork: fieldOfWork || FIELDS_OF_WORK[0],
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15),
        yearsExperience: yearsExperience ? parseInt(yearsExperience, 10) : 0,
        paymentPreference: paymentPreference || "hourly",
        hourlyRate: hourlyRate ? parseInt(hourlyRate, 10) : null,
        subscriptionPlan: "basic",
        ...buildTeachingPayload(),
      },
    });
    profileSavedRef.current = true;
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetDocumentsMeQueryKey() });
  }, [
    user, contactEmail, contactPhone, countries, countryCode, stateCode, professionCategory, educationProfessionType,
    tagline, bio, fieldOfWork, skills, yearsExperience, paymentPreference, hourlyRate,
    teachingDetails, createFreelancerProfile, queryClient, patchOnboardingStep,
  ]);

  const ensureEmployerProfile = useCallback(async () => {
    if (!user || !isValidContactEmail(contactEmail)) {
      throw new Error("Enter a valid contact email first.");
    }
    if (!isValidContactPhone(contactPhone)) {
      throw new Error("Enter a valid phone number first (8–15 digits, optional + country code).");
    }
    if (!isLocationComplete(countries, countryCode, stateCode)) {
      throw new Error("Select your country and state before uploading documents.");
    }
    if (!companyName.trim() || !industry.trim() || !description.trim()) {
      throw new Error("Fill company name, industry, and description before uploading documents.");
    }
    await persistOnboardingStep("employer", "form", { countryCode, stateCode });
    const saved = await upsertEmployerProfile.mutateAsync({
      data: {
        companyName: companyName.trim(),
        industry: industry.trim(),
        companySize: companySize || null,
        description: description.trim(),
        subscriptionPlan: "basic",
      },
    });
    queryClient.setQueryData(getGetMyEmployerProfileQueryKey(), saved);
    profileSavedRef.current = true;
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [
    user, contactEmail, contactPhone, countries, countryCode, stateCode, companyName, industry, companySize, description,
    upsertEmployerProfile, queryClient,
  ]);

  const handleResumeParsed = (data: ParsedResume) => {
    if (data.tagline) setTagline(data.tagline);
    if (data.bio) setBio(data.bio);
    if (isFieldOfWork(data.fieldOfWork)) setFieldOfWork(data.fieldOfWork);
    if (data.skills?.length) setSkills(data.skills.join(", "));
    if (data.yearsExperience) setYearsExperience(String(data.yearsExperience));
    if (data.paymentPreference) setPaymentPreference(data.paymentPreference);
    if (data.hourlyRate) setHourlyRate(String(data.hourlyRate));
    toast({
      title: "Resume imported",
      description: "Review the fields below, upload Aadhaar, then finish registration.",
    });
  };

  const handleRoleSelection = async (selectedRole: "freelancer" | "employer") => {
    if (!isValidContactEmail(contactEmail) && !isValidContactEmail(user?.primaryEmailAddress?.emailAddress)) {
      toast({ title: "Email required", description: "Add a valid contact email to continue.", variant: "destructive" });
      return;
    }
    if (!contactEmail && user?.primaryEmailAddress?.emailAddress) {
      setContactEmail(user.primaryEmailAddress.emailAddress);
    }
    setRole(selectedRole);
    try {
      await persistOnboardingStep(selectedRole, "role");
      setStep("form");
    } catch {
      setStep("form");
      toast({
        title: "Could not save progress",
        description: "Your selection was kept on this device. Try again if you switch devices.",
        variant: "destructive",
      });
    }
  };

  const handleFreelancerComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isValidContactEmail(contactEmail)) {
      toast({ title: "Email required", description: "Enter a valid contact email.", variant: "destructive" });
      return;
    }
    if (!isValidContactPhone(contactPhone)) {
      toast({
        title: "Phone required",
        description: "Select a country calling code and enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }
    if (!professionCategory || (professionCategory === "education" && !educationProfessionType)) {
      toast({ title: "Work category required", description: "Select your work category.", variant: "destructive" });
      return;
    }
    if (!isLocationComplete(countries, countryCode, stateCode)) {
      toast({ title: "Location required", description: "Select country and state.", variant: "destructive" });
      return;
    }
    if (!tagline.trim() || !fieldOfWork || !skills.trim() || !yearsExperience || !hourlyRate) {
      toast({ title: "Profile incomplete", description: "Fill in all required profile fields.", variant: "destructive" });
      return;
    }
    if (!docReady) {
      toast({ title: "Aadhaar required", description: "Upload your Aadhaar card before finishing.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await ensureFreelancerProfile();
      await upsertMe.mutateAsync({
        data: {
          role: "freelancer",
          email: contactEmail.trim(),
          phone: contactPhone.trim(),
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      toast({ title: "Welcome to TalentLock", description: "Your freelancer account is ready." });
      setLocation("/dashboard");
    } catch (err) {
      toast({
        title: "Could not finish registration",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmployerComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isValidContactEmail(contactEmail)) {
      toast({ title: "Email required", description: "Enter a valid contact email.", variant: "destructive" });
      return;
    }
    if (!isValidContactPhone(contactPhone)) {
      toast({
        title: "Phone required",
        description: "Select a country calling code and enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }
    if (!isLocationComplete(countries, countryCode, stateCode)) {
      toast({ title: "Location required", description: "Select country and state.", variant: "destructive" });
      return;
    }
    if (!companyName.trim() || !industry.trim() || !description.trim()) {
      toast({ title: "Company profile incomplete", description: "Fill in all required company fields.", variant: "destructive" });
      return;
    }
    if (!docReady) {
      toast({ title: "Aadhaar required", description: "Upload your Aadhaar card before finishing.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await ensureEmployerProfile();
      await upsertMe.mutateAsync({
        data: {
          role: "employer",
          email: contactEmail.trim(),
          phone: contactPhone.trim(),
          name: user.fullName || "",
          avatarUrl: user.imageUrl,
        },
      });
      toast({ title: "Welcome to TalentLock", description: "Your employer account is ready." });
      setLocation("/dashboard");
    } catch (err) {
      toast({
        title: "Could not finish registration",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

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

  if (!isValidContactEmail(user?.primaryEmailAddress?.emailAddress) && !isValidContactEmail(contactEmail) && step === "role") {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold">Email address required</h1>
        <p className="text-muted-foreground">
          Add a valid primary email to your Clerk account, or enter one below to continue registration.
        </p>
        <div className="text-left space-y-2">
          <Label htmlFor="bootstrap-email">Contact email</Label>
          <Input
            id="bootstrap-email"
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Complete Your Registration</h1>
        <p className="text-muted-foreground mt-2">
          {step === "role"
            ? "Choose your account type to continue."
            : "One form — fill in your details, upload Aadhaar, and finish."}
        </p>
      </div>

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
      )}

      {step === "form" && role === "freelancer" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Freelancer registration
            </CardTitle>
            <CardDescription>Complete everything on this page, then finish registration.</CardDescription>
          </CardHeader>
          <form onSubmit={handleFreelancerComplete}>
            <CardContent className="space-y-8">
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Contact details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="freelancer-email">Email <span className="text-destructive">*</span></Label>
                    <Input
                      id="freelancer-email"
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <PhoneWithCountryFields
                    id="freelancer-phone"
                    countries={countries}
                    value={contactPhone}
                    onChange={setContactPhone}
                    defaultCountryCode={countryCode || "IN"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Email and phone (with country calling code) are required for meeting invites and calendar guests.
                </p>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Work category</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setProfessionCategory("technology")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors",
                      professionCategory === "technology"
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <Laptop className="h-5 w-5 mb-2 text-muted-foreground" />
                    <p className="font-semibold">Technology</p>
                    <p className="text-xs text-muted-foreground mt-1">Software, design, data, DevOps</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfessionCategory("education")}
                    className={cn(
                      "rounded-lg border-2 p-4 text-left transition-colors",
                      professionCategory === "education"
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                  >
                    <GraduationCap className="h-5 w-5 mb-2 text-muted-foreground" />
                    <p className="font-semibold">Education</p>
                    <p className="text-xs text-muted-foreground mt-1">Teaching, tutoring, research</p>
                  </button>
                </div>
                {professionCategory === "education" && (
                  <RadioGroup
                    value={educationProfessionType ?? ""}
                    onValueChange={(v) => setEducationProfessionType(v as EducationProfessionType)}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="school_teacher" id="school_teacher" />
                      <Label htmlFor="school_teacher" className="font-normal cursor-pointer">School Teacher</Label>
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
                )}
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Location</h3>
                <CountryStateFields
                  countries={countries}
                  countryCode={countryCode}
                  stateCode={stateCode}
                  onCountryChange={(code) => {
                    setCountryCode(code);
                    setStateCode(null);
                  }}
                  onStateChange={setStateCode}
                  disabled={countries.length === 0}
                />
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Profile</h3>
                <div className="rounded-lg border border-dashed border-[#c9a84c]/40 bg-[#c9a84c]/5 p-4 space-y-2">
                  <p className="text-sm font-semibold">Import from resume (optional)</p>
                  <p className="text-xs text-muted-foreground">AI fills the fields below — you still need Aadhaar to finish.</p>
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
                      <SelectTrigger id="fieldOfWork"><SelectValue placeholder="Select field" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {FIELDS_OF_WORK.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearsExperience">Years of Experience</Label>
                    <Input id="yearsExperience" type="number" min="0" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skills">Skills (comma separated)</Label>
                  <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} required />
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
                    <Label>Payment Preference</Label>
                    <Select value={paymentPreference} onValueChange={setPaymentPreference}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly Rate</SelectItem>
                        <SelectItem value="daily">Daily Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rate">Rate</Label>
                    <Input id="rate" type="number" min="0" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required />
                  </div>
                </div>
              </section>

              <section>
                <FreelancerDocumentOnboardingStep
                  embedded
                  ensureProfile={ensureFreelancerProfile}
                  onReadyChange={setDocReady}
                  onBusyChange={setDocBusy}
                />
              </section>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); setDocReady(false); }}>
                Back
              </Button>
              <Button type="submit" disabled={submitting || docBusy}>
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finishing…</>
                ) : !docReady ? (
                  "Upload Aadhaar to finish"
                ) : (
                  "Finish registration →"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "form" && role === "employer" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              Employer registration
            </CardTitle>
            <CardDescription>Complete everything on this page, then finish registration.</CardDescription>
          </CardHeader>
          {employerProfileLoadFailed ? (
            <CardContent>
              <p className="text-sm text-destructive">Could not load your saved company profile. Try again in a moment.</p>
            </CardContent>
          ) : (
            <form onSubmit={handleEmployerComplete}>
              <CardContent className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Contact details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="employer-email">Email <span className="text-destructive">*</span></Label>
                      <Input
                        id="employer-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@company.com"
                      />
                    </div>
                    <PhoneWithCountryFields
                      id="employer-phone"
                      countries={countries}
                      value={contactPhone}
                      onChange={setContactPhone}
                      defaultCountryCode={countryCode || "IN"}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Email and phone (with country calling code) are required for meeting invites and calendar guests.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Location</h3>
                  <CountryStateFields
                    countries={countries}
                    countryCode={countryCode}
                    stateCode={stateCode}
                    onCountryChange={(code) => {
                      setCountryCode(code);
                      setStateCode(null);
                    }}
                    onStateChange={setStateCode}
                    disabled={countries.length === 0}
                  />
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Company profile</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry</Label>
                      <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companySize">Company Size</Label>
                    <Select value={companySize} onValueChange={setCompanySize}>
                      <SelectTrigger><SelectValue placeholder="Select company size" /></SelectTrigger>
                      <SelectContent>
                        {COMPANY_SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Company Description</Label>
                    <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
                  </div>
                </section>

                <section>
                  <EmployerDocumentOnboardingStep
                    embedded
                    ensureProfile={ensureEmployerProfile}
                    onReadyChange={setDocReady}
                    onBusyChange={setDocBusy}
                  />
                </section>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => { setStep("role"); setRole(null); setDocReady(false); }}>
                  Back
                </Button>
                <Button type="submit" disabled={submitting || docBusy}>
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finishing…</>
                  ) : !docReady ? (
                    "Upload Aadhaar to finish"
                  ) : (
                    "Finish registration →"
                  )}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
